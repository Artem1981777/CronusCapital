// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./Harness.sol";
import "../CronusIdentityRegistry.sol";

contract IdentityRegistryTest is Test {
    CronusIdentityRegistry reg;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address agentA = address(0xA1);
    address agentB = address(0xA2);
    function setUp() public { reg = new CronusIdentityRegistry(); }

    function test_RegisterIncrementingIds() public {
        vm.prank(alice);
        uint256 id1 = reg.register(agentA, "a.example", "ipfs://a");
        assertEq(id1, 1);
        vm.prank(bob);
        uint256 id2 = reg.register(agentB, "b.example", "ipfs://b");
        assertEq(id2, 2);
        assertEq(reg.agentCount(), 2);
        assertTrue(reg.isRegistered(agentA));
        assertEq(reg.agentIdByAddress(agentA), 1);
    }
    function test_DuplicateReverts() public {
        vm.prank(alice);
        reg.register(agentA, "a", "u");
        vm.prank(bob);
        vm.expectRevert(CronusIdentityRegistry.AlreadyRegistered.selector);
        reg.register(agentA, "a2", "u2");
    }
    function test_ZeroAddressReverts() public {
        vm.expectRevert(CronusIdentityRegistry.ZeroAddress.selector);
        reg.register(address(0), "x", "y");
    }
    function test_ResolveByIdAndAddress() public {
        vm.prank(alice);
        uint256 id = reg.register(agentA, "dom", "uri");
        CronusIdentityRegistry.Agent memory a = reg.resolveById(id);
        assertEq(a.agentAddress, agentA);
        assertEq(a.owner, alice);
        assertEq(a.agentDomain, "dom");
        CronusIdentityRegistry.Agent memory b = reg.resolveByAddress(agentA);
        assertEq(b.agentId, id);
    }
    function test_ResolveUnknownReverts() public {
        vm.expectRevert(CronusIdentityRegistry.NotRegistered.selector);
        reg.resolveById(99);
    }
    function test_TransferOwnerOnly() public {
        vm.prank(alice);
        uint256 id = reg.register(agentA, "d", "u");
        vm.prank(bob);
        vm.expectRevert(CronusIdentityRegistry.NotOwner.selector);
        reg.transferAgent(id, bob);
        vm.prank(alice);
        reg.transferAgent(id, bob);
        assertEq(reg.resolveById(id).owner, bob);
    }
}
