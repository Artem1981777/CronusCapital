// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Harness.sol";
import "../CronusDrillCertificate.sol";

/// Tests for the soulbound certificate. The point of most of these is not that the
/// contract mints nicely, but that it refuses to flatter us: a skipped scenario must
/// never be counted as a passed one, and a certificate must go stale on its own.
contract DrillCertificateTest is Test {
    CronusDrillCertificate cert;

    address operator = address(0xA11CE); // the hot key that runs the drills
    address guardian = address(0x6DA0);  // watcher, revoke only
    address holder   = address(0x5AFE);  // multisig, every certificate lands here
    address guard    = address(0x60A9D);
    address stranger = address(0xBAD);

    function setUp() public {
        cert = new CronusDrillCertificate(operator, guardian, holder, guard);
    }

    // ---- helpers ----
    function _one(string memory expect_, string memory outcome_)
        internal
        pure
        returns (CronusDrillCertificate.Scenario[] memory s)
    {
        s = new CronusDrillCertificate.Scenario[](1);
        s[0] = CronusDrillCertificate.Scenario({
            id: "drain_to_new_address",
            expect: expect_,
            outcome: outcome_,
            reason: "recipient not allowlisted",
            txHash: bytes32(uint256(1)),
            blockNumber: 56524753
        });
    }

    function _mint(string memory expect_, string memory outcome_) internal returns (uint256) {
        vm.prank(operator);
        return cert.mint(uint64(block.timestamp), 25e6, 100e6, 250e6, _one(expect_, outcome_));
    }

    // ---- who may write history ----
    function test_OnlyOperatorCanMint() public {
        vm.prank(stranger);
        vm.expectRevert();
        cert.mint(uint64(block.timestamp), 25e6, 100e6, 250e6, _one("revert", "reverted"));
    }

    function test_EveryCertificateLandsWithTheHolder() public {
        uint256 id = _mint("revert", "reverted");
        assertEq(cert.ownerOf(id), holder);
        assertEq(cert.totalSupply(), 1);
    }

    // ---- the honesty rules ----
    function test_RejectedAttack_IsHolding() public {
        uint256 id = _mint("revert", "reverted");
        assertEq(cert.status(id), "HOLDING");
    }

    function test_SkippedIsNeverCountedAsPassed() public {
        uint256 id = _mint("revert", "skipped");
        assertEq(cert.status(id), "INCOMPLETE");
    }

    function test_AttackThatSucceeded_IsBreached() public {
        uint256 id = _mint("revert", "succeeded");
        assertEq(cert.status(id), "BREACHED");
    }

    function test_BreachOutranksSkip() public {
        CronusDrillCertificate.Scenario[] memory s = new CronusDrillCertificate.Scenario[](2);
        s[0] = CronusDrillCertificate.Scenario("a", "revert", "skipped", "", bytes32(0), 0);
        s[1] = CronusDrillCertificate.Scenario("b", "revert", "succeeded", "", bytes32(0), 0);
        vm.prank(operator);
        uint256 id = cert.mint(uint64(block.timestamp), 25e6, 100e6, 250e6, s);
        assertEq(cert.status(id), "BREACHED");
    }

    // ---- it must rot by itself if we stop drilling ----
    function test_GoesStaleAfterOneDay() public {
        uint256 id = _mint("revert", "reverted");
        assertEq(cert.status(id), "HOLDING");
        vm.warp(block.timestamp + 1 days + 1);
        assertEq(cert.status(id), "EXPIRED");
    }

    // ---- negative power only ----
    function test_GuardianCanRevoke() public {
        uint256 id = _mint("revert", "reverted");
        vm.prank(guardian);
        cert.revoke(id);
        assertEq(cert.status(id), "REVOKED");
    }

    function test_OperatorCannotRevoke() public {
        uint256 id = _mint("revert", "reverted");
        vm.prank(operator);
        vm.expectRevert();
        cert.revoke(id);
    }

    function test_RevokedOutranksEverything() public {
        uint256 id = _mint("revert", "succeeded");
        vm.prank(guardian);
        cert.revoke(id);
        assertEq(cert.status(id), "REVOKED");
    }

    // ---- soulbound ----
    function test_TransferReverts() public {
        uint256 id = _mint("revert", "reverted");
        vm.prank(holder);
        vm.expectRevert();
        cert.transferFrom(holder, stranger, id);
    }

    function test_ApproveReverts() public {
        uint256 id = _mint("revert", "reverted");
        vm.prank(holder);
        vm.expectRevert();
        cert.approve(stranger, id);
    }

    function test_SetApprovalForAllReverts() public {
        _mint("revert", "reverted");
        vm.prank(holder);
        vm.expectRevert();
        cert.setApprovalForAll(stranger, true);
    }

    // ---- the artwork has to exist on-chain, not on our server ----
    function test_TokenUriIsSelfContained() public {
        uint256 id = _mint("revert", "reverted");
        string memory uri = cert.tokenURI(id);
        assertTrue(bytes(uri).length > 500);
    }

    function test_TokenUriOfMissingToken_Reverts() public {
        vm.expectRevert();
        cert.tokenURI(999);
    }
}
