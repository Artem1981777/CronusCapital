// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Harness.sol";
import "../CronusAgentGuard.sol";

contract CronusAgentGuardTest is Test {
    MockERC20 usdc;
    CronusAgentGuard guard;

    address operator = address(0xA11CE); // AI hot key
    address guardian = address(0x6DA0);  // watcher
    address recovery = address(0xC01D);  // cold sink
    address vendor   = address(0xBEEF);  // allowlisted recipient
    address attacker = address(0xBAD);   // NOT allowlisted

    uint256 constant PER_TX = 25e6;     // 25 USDC
    uint256 constant DAILY  = 100e6;    // 100 USDC
    uint256 constant FUND   = 10_000e6; // 10k USDC in the vault

    function setUp() public {
        usdc = new MockERC20();
        // owner = this test contract (the deployer)
        guard = new CronusAgentGuard(address(usdc), operator, guardian, recovery, PER_TX, DAILY);
        usdc.mint(address(guard), FUND);
        guard.setAllowed(vendor, true);
    }

    // CONTAINMENT: rogue agent cannot drain to a brand-new address
    function test_RogueDrainToAttacker_Reverts() public {
        vm.prank(operator);
        vm.expectRevert();
        guard.spend(attacker, FUND);
        assertEq(usdc.balanceOf(address(guard)), FUND); // vault intact
        assertEq(usdc.balanceOf(attacker), 0);          // attacker gets nothing
    }

    function test_OverPerTxCap_Reverts() public {
        vm.prank(operator);
        vm.expectRevert();
        guard.spend(vendor, PER_TX + 1);
    }

    function test_DailyCap_Reverts_AfterLimit() public {
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(operator);
            guard.spend(vendor, 25e6); // 4 x 25 = 100 (ok)
        }
        vm.prank(operator);
        vm.expectRevert();
        guard.spend(vendor, 25e6); // 5th blocked
        assertEq(usdc.balanceOf(vendor), DAILY);
    }

    function test_DailyWindowResets() public {
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(operator);
            guard.spend(vendor, 25e6);
        }
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(operator);
        guard.spend(vendor, 25e6); // new window, ok again
        assertEq(usdc.balanceOf(vendor), DAILY + 25e6);
    }

    // CIRCUIT BREAKER: guardian freezes everything instantly
    function test_GuardianPauses_BlocksSpend() public {
        vm.prank(guardian);
        guard.pause();
        vm.prank(operator);
        vm.expectRevert();
        guard.spend(vendor, 1e6);
    }

    // LEAST PRIVILEGE: operator cannot touch config or funds
    function test_OperatorCannotSweep() public {
        vm.prank(operator);
        vm.expectRevert();
        guard.sweepToRecovery();
    }

    function test_OperatorCannotChangeAllowlist() public {
        vm.prank(operator);
        vm.expectRevert();
        guard.setAllowed(attacker, true);
    }

    function test_OperatorCannotRaiseLimits() public {
        vm.prank(operator);
        vm.expectRevert();
        guard.setLimits(1e12, 1e12);
    }

    function test_OperatorCannotUnpause() public {
        vm.prank(guardian);
        guard.pause();
        vm.prank(operator);
        vm.expectRevert();
        guard.unpause();
    }

    // HAPPY PATH: normal bounded spend works
    function test_HappyPathSpend() public {
        vm.prank(operator);
        bool ok = guard.spend(vendor, 10e6);
        assertTrue(ok);
        assertEq(usdc.balanceOf(vendor), 10e6);
    }

    // RECOVERY: only owner moves the full balance, only to recovery
    function test_OwnerRecoverySweep() public {
        uint256 got = guard.sweepToRecovery(); // owner = this
        assertEq(got, FUND);
        assertEq(usdc.balanceOf(recovery), FUND);
        assertEq(usdc.balanceOf(address(guard)), 0);
    }
}
