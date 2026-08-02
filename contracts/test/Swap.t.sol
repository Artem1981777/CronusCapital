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
        pool.swapExactIn(address(0xDEAD), 100, 0, address(this), block.timestamp);
    }

    function testSwapKeepsInvariantAndPaysOut() public {
        usdc.mint(trader, 10_000);
        vm.startPrank(trader);
        usdc.approve(address(pool), type(uint256).max);
        uint256 k0 = pool.reserveA() * pool.reserveB();
        uint256 out = pool.swapExactIn(address(usdc), 10_000, 1, trader, block.timestamp);
        vm.stopPrank();
        assertTrue(out > 0);
        assertEq(crn.balanceOf(trader), out);
        assertTrue(pool.reserveA() * pool.reserveB() >= k0);
    }

    function testPriceMovesAgainstTheTrader() public {
        usdc.mint(trader, 200_000);
        vm.startPrank(trader);
        usdc.approve(address(pool), type(uint256).max);
        uint256 first = pool.swapExactIn(address(usdc), 100_000, 1, trader, block.timestamp);
        uint256 second = pool.swapExactIn(address(usdc), 100_000, 1, trader, block.timestamp);
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
        pool.swapExactIn(address(usdc), 10_000, fair + 1, trader, block.timestamp);
        vm.stopPrank();
    }

    function testBothDirections() public {
        crn.mint(trader, 1_000_000);
        vm.startPrank(trader);
        crn.approve(address(pool), type(uint256).max);
        uint256 out = pool.swapExactIn(address(crn), 1_000_000, 1, trader, block.timestamp);
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

    // --- v2 hardening tests ---

    function testExpiredDeadlineReverts() public {
        usdc.mint(trader, 10_000);
        vm.warp(1000);
        vm.startPrank(trader);
        usdc.approve(address(pool), type(uint256).max);
        vm.expectRevert();
        pool.swapExactIn(address(usdc), 10_000, 1, trader, 999);
        vm.stopPrank();
    }

    function testOwnerCanPauseAndBlockSwaps() public {
        pool.pause();
        usdc.mint(trader, 10_000);
        vm.startPrank(trader);
        usdc.approve(address(pool), type(uint256).max);
        vm.expectRevert();
        pool.swapExactIn(address(usdc), 10_000, 1, trader, block.timestamp);
        vm.stopPrank();
    }

    function testUnpauseRestoresSwaps() public {
        pool.pause();
        pool.unpause();
        usdc.mint(trader, 10_000);
        vm.startPrank(trader);
        usdc.approve(address(pool), type(uint256).max);
        uint256 out = pool.swapExactIn(address(usdc), 10_000, 1, trader, block.timestamp);
        vm.stopPrank();
        assertTrue(out > 0);
    }

    function testOnlyOwnerPauses() public {
        vm.prank(trader);
        vm.expectRevert();
        pool.pause();
    }

    function testReentrancyIsBlocked() public {
        // A hostile output token tries to re-enter swapExactIn from inside its
        // own transfer(). The non-reentrancy lock must make that inner call
        // revert, which bubbles up and reverts the whole swap.
        MockERC20 base = new MockERC20();
        ReentrantToken evil = new ReentrantToken();
        CronusSwap p = new CronusSwap(address(base), address(evil));
        base.mint(address(this), 1_000_000);
        evil.mint(address(this), 1_000_000);
        base.approve(address(p), type(uint256).max);
        evil.approve(address(p), type(uint256).max);
        p.addLiquidity(1_000_000, 1_000_000);
        evil.setPool(p, address(base));

        base.mint(trader, 10_000);
        evil.arm();
        vm.startPrank(trader);
        base.approve(address(p), type(uint256).max);
        vm.expectRevert();
        p.swapExactIn(address(base), 10_000, 0, trader, block.timestamp);
        vm.stopPrank();
    }
}

// A token that re-enters the pool during transfer(), to prove the guard holds.
contract ReentrantToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    CronusSwap public pool;
    address public other;
    bool public attack;

    function setPool(CronusSwap p, address o) external { pool = p; other = o; }
    function arm() external { attack = true; }
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a; return true;
    }
    function transfer(address to, uint256 a) external returns (bool) {
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a; balanceOf[to] += a;
        if (attack) {
            attack = false; // one shot, so absent guard would not infinite-loop the test
            pool.swapExactIn(other, 1, 0, address(this), block.timestamp);
        }
        return true;
    }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        require(balanceOf[f] >= a, "balance");
        uint256 al = allowance[f][msg.sender];
        require(al >= a, "allowance");
        if (al != type(uint256).max) allowance[f][msg.sender] = al - a;
        balanceOf[f] -= a; balanceOf[to] += a; return true;
    }
}
