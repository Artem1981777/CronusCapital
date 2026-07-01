// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./Harness.sol";
import "../CronusVault.sol";

contract VaultTest is Test {
    MockERC20 usdc;
    CronusVault vault;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    function setUp() public {
        usdc = new MockERC20();
        vault = new CronusVault(address(usdc));
        usdc.mint(alice, 1000000);
        usdc.mint(bob, 1000000);
    }
    function test_FirstDepositOneToOne() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 500000);
        uint256 sh = vault.deposit(500000);
        vm.stopPrank();
        assertEq(sh, 500000);
        assertEq(vault.totalShares(), 500000);
        assertEq(vault.shares(alice), 500000);
        assertEq(vault.totalAssets(), 500000);
    }
    function test_YieldIncreasesShareValue() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 500000);
        vault.deposit(500000);
        vm.stopPrank();
        usdc.mint(address(this), 500000);
        usdc.approve(address(vault), 500000);
        vault.addYield(500000);
        assertEq(vault.totalAssets(), 1000000);
        vm.startPrank(bob);
        usdc.approve(address(vault), 500000);
        uint256 sh = vault.deposit(500000);
        vm.stopPrank();
        assertEq(sh, 250000);
        vm.prank(alice);
        uint256 got = vault.withdrawAll();
        assertEq(got, 1000000);
    }
    function test_DepositZeroReverts() public {
        vm.expectRevert();
        vault.deposit(0);
    }
    function test_AddYieldOnlyOwner() public {
        usdc.mint(bob, 100);
        vm.startPrank(bob);
        usdc.approve(address(vault), 100);
        vm.expectRevert();
        vault.addYield(100);
        vm.stopPrank();
    }
    function test_WithdrawNoSharesReverts() public {
        vm.prank(bob);
        vm.expectRevert();
        vault.withdrawAll();
    }
}
