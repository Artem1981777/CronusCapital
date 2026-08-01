// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Harness.sol";
import "../CronusSwap.sol";

contract SwapTest is Test {
    MockERC20 usdc;
    MockERC20 crn;
    CronusSwap pool;
    address trader = address(0xBEEF);

    function setUp() public {
        usdc = new MockERC20();
        crn = new MockERC20();
        pool = new CronusSwap(address(usdc), address(crn));
        usdc.mint(address(this), 1_000_000);
        crn.mint(address(this), 1_000_000_000);
        usdc.approve(address(pool), type(uint256).max);
        crn.approve(address(pool), type(uint256).max);
        pool.addLiquidity(1_000_000, 1_000_000_000);
    }

    function testLiquidityIsTracked() public view {
        assertEq(pool.reserveA(), 1_000_000);
        assertEq(pool.reserveB(), 1_000_000_000);
    }

    function testOnlyOwnerAddsLiquidity() public {
        vm.prank(trader);
        vm.expectRevert();
        pool.addLiquidity(1, 1);
    }

    function testUnknownTokenReverts() public {
        vm.expectRevert();
        pool.swapExactIn(address(0xDEAD), 100, 0, address(this));
    }

    function testSwapKeepsInvariantAndPaysOut() public {
        usdc.mint(trader, 10_000);
        vm.startPrank(trader);
        usdc.approve(address(pool), type(uint256).max);
        uint256 k0 = pool.reserveA() * pool.reserveB();
        uint256 out = pool.swapExactIn(address(usdc), 10_000, 1, trader);
        vm.stopPrank();
        assertTrue(out > 0);
        assertEq(crn.balanceOf(trader), out);
        assertTrue(pool.reserveA() * pool.reserveB() >= k0);
    }

    function testPriceMovesAgainstTheTrader() public {
        usdc.mint(trader, 200_000);
        vm.startPrank(trader);
        usdc.approve(address(pool), type(uint256).max);
        uint256 first = pool.swapExactIn(address(usdc), 100_000, 1, trader);
        uint256 second = pool.swapExactIn(address(usdc), 100_000, 1, trader);
        vm.stopPrank();
        // Same input, worse output: the pool is not a fixed-rate exchange.
        assertTrue(second < first);
    }

    function testSlippageGuardReverts() public {
        usdc.mint(trader, 10_000);
        vm.startPrank(trader);
        usdc.approve(address(pool), type(uint256).max);
        uint256 fair = pool.quote(address(usdc), 10_000);
        vm.expectRevert();
        pool.swapExactIn(address(usdc), 10_000, fair + 1, trader);
        vm.stopPrank();
    }

    function testBothDirections() public {
        crn.mint(trader, 1_000_000);
        vm.startPrank(trader);
        crn.approve(address(pool), type(uint256).max);
        uint256 out = pool.swapExactIn(address(crn), 1_000_000, 1, trader);
        vm.stopPrank();
        assertTrue(out > 0);
        assertEq(usdc.balanceOf(trader), out);
    }

    function testFeeIsCharged() public view {
        // Without a fee, an infinitesimal trade would price at the reserve ratio.
        // With 0.3% taken off the input, the output must be strictly below it.
        uint256 out = pool.getAmountOut(1_000_000, 1_000_000, 1_000_000_000);
        assertTrue(out < 500_000_000);
    }

    function testEmptyPoolReverts() public {
        CronusSwap empty = new CronusSwap(address(usdc), address(crn));
        vm.expectRevert();
        empty.quote(address(usdc), 100);
    }
}
