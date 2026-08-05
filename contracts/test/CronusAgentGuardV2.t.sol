// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Harness.sol";
import "../CronusAgentGuardV2.sol";

contract CronusAgentGuardV2Test is Test {
    CronusAgentGuardV2 guard;
    MockERC20 usdc;

    address operator = address(0xA11CE);
    address guardian = address(0x6DA0);
    address recovery = address(0xC01D);
    address vendor   = address(0xBEEF);
    address attacker = address(0xBAD);

    uint256 constant PER_TX = 25e6;
    uint256 constant DAILY  = 100e6;
    uint256 constant MAXP   = 50e6;
    uint256 constant MAXD   = 500e6;
    uint256 constant DELAY  = 2 days;
    uint256 constant FUND   = 10_000e6;

    function setUp() public {
        usdc = new MockERC20();
        guard = new CronusAgentGuardV2(
            address(usdc), address(this), operator, guardian, recovery,
            PER_TX, DAILY, MAXP, MAXD, DELAY
        );
        usdc.mint(address(guard), FUND);
    }

    // owner=address(this): queue+wait+execute a privileged setter
    function _allow(address who) internal {
        bytes memory data = abi.encodeWithSelector(guard.extAddAllowed.selector, who);
        bytes32 salt = keccak256(abi.encodePacked("allow", who));
        guard.queue(data, salt);
        vm.warp(block.timestamp + DELAY);
        guard.execute(data, salt);
    }

    function test_ConstructorRejectsOverHardCap() public {
        vm.expectRevert();
        new CronusAgentGuardV2(
            address(usdc), address(this), operator, guardian, recovery,
            MAXP + 1, DAILY, MAXP, MAXD, DELAY
        );
    }

    function test_TimelockBlocksBeforeDelay() public {
        bytes memory data = abi.encodeWithSelector(guard.extSetLimits.selector, uint256(30e6), uint256(60e6));
        bytes32 salt = bytes32(uint256(1));
        guard.queue(data, salt);
        vm.expectRevert(); // "timelock"
        guard.execute(data, salt);
    }

    function test_TimelockExecutesAfterDelay() public {
        bytes memory data = abi.encodeWithSelector(guard.extSetLimits.selector, uint256(30e6), uint256(60e6));
        bytes32 salt = bytes32(uint256(2));
        guard.queue(data, salt);
        vm.warp(block.timestamp + DELAY);
        guard.execute(data, salt);
        assertEq(guard.perTxCap(), uint256(30e6));
        assertEq(guard.dailyCap(), uint256(60e6));
    }

    function test_GuardianVetoCancelsOp() public {
        bytes memory data = abi.encodeWithSelector(guard.extSetOperator.selector, attacker);
        bytes32 salt = bytes32(uint256(3));
        bytes32 id = guard.queue(data, salt);
        vm.prank(guardian);
        guard.cancel(id);
        vm.warp(block.timestamp + DELAY);
        vm.expectRevert(); // "not queued"
        guard.execute(data, salt);
    }

    function test_GuardianCannotQueue() public {
        bytes memory data = abi.encodeWithSelector(guard.extAddAllowed.selector, vendor);
        vm.prank(guardian);
        vm.expectRevert(); // "not owner"
        guard.queue(data, bytes32(uint256(4)));
    }

    function test_HardCapEnforcedOnExecute() public {
        bytes memory data = abi.encodeWithSelector(guard.extSetLimits.selector, uint256(MAXP + 1), uint256(DAILY));
        bytes32 salt = bytes32(uint256(5));
        guard.queue(data, salt);
        vm.warp(block.timestamp + DELAY);
        vm.expectRevert(); // inner "over hard cap" -> "exec failed"
        guard.execute(data, salt);
    }

    function test_OperatorStillBounded() public {
        _allow(vendor);
        vm.prank(operator);
        vm.expectRevert(); // over per-tx cap
        guard.spend(vendor, PER_TX + 1);

        vm.prank(operator);
        guard.spend(vendor, 10e6);
        assertEq(usdc.balanceOf(vendor), uint256(10e6));
    }

    function test_OperatorCannotReachNewAddress() public {
        _allow(vendor);
        vm.prank(operator);
        vm.expectRevert(); // recipient not allowlisted
        guard.spend(attacker, 1e6);
    }

    function test_EmergencyExitByRecovery() public {
        vm.prank(recovery);
        guard.emergencyExit();
        assertEq(usdc.balanceOf(recovery), FUND);
        assertEq(usdc.balanceOf(address(guard)), uint256(0));
    }

    function test_OperatorCannotExit() public {
        vm.prank(operator);
        vm.expectRevert(); // not authorized
        guard.emergencyExit();
    }

    function test_GuardianPauseBlocksSpend() public {
        _allow(vendor);
        vm.prank(guardian);
        guard.pause();
        vm.prank(operator);
        vm.expectRevert(); // paused
        guard.spend(vendor, 1e6);
    }

    function test_GuardianRemoveAllowlist() public {
        _allow(vendor);
        vm.prank(guardian);
        guard.removeAllowed(vendor);
        vm.prank(operator);
        vm.expectRevert(); // recipient not allowlisted
        guard.spend(vendor, 1e6);
    }

    function test_RenounceFreezesAdmin() public {
        _allow(vendor); // allowlist before freezing
        bytes memory data = abi.encodeWithSelector(guard.extRenounceOwnership.selector);
        bytes32 salt = bytes32(uint256(9));
        guard.queue(data, salt);
        vm.warp(block.timestamp + DELAY);
        guard.execute(data, salt);
        assertEq(guard.owner(), address(0));

        // operator still works after the rules are frozen
        vm.prank(operator);
        guard.spend(vendor, 5e6);
        assertEq(usdc.balanceOf(vendor), uint256(5e6));

        // admin is frozen: no one can queue anymore
        bytes memory data2 = abi.encodeWithSelector(guard.extAddAllowed.selector, attacker);
        vm.expectRevert(); // "not owner"
        guard.queue(data2, bytes32(uint256(10)));
    }
}
