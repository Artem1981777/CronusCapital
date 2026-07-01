// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./Harness.sol";
import "../CronusJobEscrow.sol";
import "../CronusIdentityRegistry.sol";

contract JobEscrowTest is Test {
    MockERC20 usdc;
    CronusIdentityRegistry reg;
    CronusJobEscrow escrow;
    address client = address(0xC11);
    address provider = address(0xADD);
    address evaluator = address(0xE7A);
    function setUp() public {
        usdc = new MockERC20();
        reg = new CronusIdentityRegistry();
        reg.register(provider, "prov", "uri");
        escrow = new CronusJobEscrow(address(usdc), address(reg));
        usdc.mint(client, 1000000);
    }
    function _create(uint256 amount, address ev) internal returns (uint256 id) {
        vm.startPrank(client);
        usdc.approve(address(escrow), amount);
        id = escrow.createJob(provider, ev, amount, uint64(block.timestamp + 1 days), "spec");
        vm.stopPrank();
    }
    function test_CreateEscrowsFunds() public {
        uint256 id = _create(100000, address(0));
        assertEq(id, 1);
        assertEq(usdc.balanceOf(address(escrow)), 100000);
        assertEq(uint256(escrow.getJob(id).status), uint256(CronusJobEscrow.Status.Funded));
    }
    function test_SubmitReleasePaysProvider() public {
        uint256 id = _create(100000, address(0));
        vm.prank(provider);
        escrow.submit(id, "result");
        vm.prank(client);
        escrow.release(id);
        assertEq(usdc.balanceOf(provider), 100000);
        assertEq(uint256(escrow.getJob(id).status), uint256(CronusJobEscrow.Status.Completed));
    }
    function test_RejectRefundsClient() public {
        uint256 id = _create(100000, address(0));
        vm.prank(provider);
        escrow.submit(id, "result");
        uint256 before = usdc.balanceOf(client);
        vm.prank(client);
        escrow.reject(id);
        assertEq(usdc.balanceOf(client), before + 100000);
    }
    function test_SubmitOnlyProvider() public {
        uint256 id = _create(100000, address(0));
        vm.prank(client);
        vm.expectRevert(CronusJobEscrow.NotProvider.selector);
        escrow.submit(id, "x");
    }
    function test_ReleaseOnlyArbiter() public {
        uint256 id = _create(100000, address(0));
        vm.prank(provider);
        escrow.submit(id, "r");
        vm.prank(provider);
        vm.expectRevert(CronusJobEscrow.NotArbiter.selector);
        escrow.release(id);
    }
    function test_EvaluatorCanRelease() public {
        uint256 id = _create(100000, evaluator);
        vm.prank(provider);
        escrow.submit(id, "r");
        vm.prank(evaluator);
        escrow.release(id);
        assertEq(usdc.balanceOf(provider), 100000);
    }
    function test_RefundExpired() public {
        uint256 id = _create(100000, address(0));
        vm.prank(client);
        vm.expectRevert(CronusJobEscrow.NotExpired.selector);
        escrow.refundExpired(id);
        vm.warp(block.timestamp + 2 days);
        uint256 before = usdc.balanceOf(client);
        vm.prank(client);
        escrow.refundExpired(id);
        assertEq(usdc.balanceOf(client), before + 100000);
    }
    function test_UnregisteredProviderReverts() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), 100000);
        vm.expectRevert(CronusJobEscrow.ProviderNotRegistered.selector);
        escrow.createJob(address(0xBEEF), address(0), 100000, uint64(block.timestamp + 1 days), "s");
        vm.stopPrank();
    }
}
