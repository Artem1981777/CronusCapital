// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Harness.sol";
import "../CronusAccessPass.sol";

/// A stand-in for the real certificate so we can drive every status without waiting a day.
contract FakeCertificate {
    uint256 public totalSupply;
    string private _status;

    function setStatus(string memory s) external {
        _status = s;
        totalSupply = 1;
    }

    function clear() external {
        totalSupply = 0;
    }

    function status(uint256) external view returns (string memory) {
        return _status;
    }
}

/// Tests for the access pass. The ones that matter are the refusals: the contract must not
/// promise coverage it cannot pay, and must switch coverage off by itself once we stop
/// exercising the containment.
contract AccessPassTest is Test {
    MockERC20 usdc;
    FakeCertificate certificate;
    CronusAccessPass pass;

    address treasury = address(0x7EA);
    address buyer    = address(0xB0B);
    address other    = address(0xA11CE);

    uint256 constant PRICE    = 2e6;      // 2 USDC
    uint256 constant PERIOD   = 30 days;
    uint256 constant COVERAGE = 5e6;      // upper bound per pass

    function setUp() public {
        usdc = new MockERC20();
        certificate = new FakeCertificate();
        certificate.setStatus("HOLDING");
        pass = new CronusAccessPass(address(usdc), treasury, address(certificate), PRICE, PERIOD, COVERAGE);
        usdc.mint(buyer, 1000e6);
        usdc.mint(other, 1000e6);
    }

    function _buy(address who) internal returns (uint256 id) {
        vm.startPrank(who);
        usdc.approve(address(pass), type(uint256).max);
        id = pass.mint();
        vm.stopPrank();
    }

    // ---- paying is a real transfer, not a button ----
    function test_MintWithoutApproval_Reverts() public {
        vm.prank(buyer);
        vm.expectRevert();
        pass.mint();
    }

    function test_HalfThePaymentStaysAsCoverage() public {
        _buy(buyer);
        assertEq(pass.poolUsdc(), PRICE / 2);
        assertEq(usdc.balanceOf(treasury), PRICE - PRICE / 2);
        assertEq(usdc.balanceOf(address(pass)), PRICE / 2);
    }

    function test_OnePassPerAddress() public {
        _buy(buyer);
        vm.startPrank(buyer);
        vm.expectRevert();
        pass.mint();
        vm.stopPrank();
    }

    // ---- access is time-bounded and read straight from chain ----
    function test_AccessLapsesOnItsOwn() public {
        uint256 id = _buy(buyer);
        assertTrue(pass.hasAccess(buyer));
        assertTrue(pass.isActive(id));
        vm.warp(block.timestamp + PERIOD + 1);
        assertEq(pass.hasAccess(buyer), false);
        assertEq(pass.isActive(id), false);
    }

    function test_RenewExtendsAccess() public {
        uint256 id = _buy(buyer);
        uint64 first = pass.expiresAt(id);
        vm.startPrank(buyer);
        pass.renew(id);
        vm.stopPrank();
        assertEq(uint256(pass.expiresAt(id)), uint256(first) + PERIOD);
        assertEq(pass.poolUsdc(), PRICE);
    }

    // ---- the leash: coverage follows the drills ----
    function test_CoverageDiesWhenCertificateGoesStale() public {
        _buy(buyer);
        (bool liveBefore, ) = pass.coverage();
        assertTrue(liveBefore);
        certificate.setStatus("EXPIRED");
        (bool liveAfter, ) = pass.coverage();
        assertEq(liveAfter, false);
    }

    function test_NoCertificateMeansNoCoverage() public {
        certificate.clear();
        (bool live, ) = pass.coverage();
        assertEq(live, false);
        assertEq(pass.latestCertificateStatus(), "NONE");
    }

    function test_RevokedCertificateKillsCoverage() public {
        certificate.setStatus("REVOKED");
        (bool live, ) = pass.coverage();
        assertEq(live, false);
    }

    // ---- the payout ----
    function test_ClaimRevertsWhileTheContainmentHolds() public {
        uint256 id = _buy(buyer);
        vm.prank(buyer);
        vm.expectRevert();
        pass.claim(id);
    }

    function test_ClaimPaysOnceWhenABreachIsCertified() public {
        uint256 id = _buy(buyer);
        certificate.setStatus("BREACHED");
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(buyer);
        uint256 paid = pass.claim(id);
        assertEq(paid, PRICE / 2);
        assertEq(usdc.balanceOf(buyer), before + PRICE / 2);
        assertEq(pass.poolUsdc(), 0);

        vm.prank(buyer);
        vm.expectRevert();
        pass.claim(id);
    }

    function test_OnlyTheOwnerCanClaim() public {
        uint256 id = _buy(buyer);
        certificate.setStatus("BREACHED");
        vm.prank(other);
        vm.expectRevert();
        pass.claim(id);
    }

    function test_ExpiredPassCannotClaim() public {
        uint256 id = _buy(buyer);
        certificate.setStatus("BREACHED");
        vm.warp(block.timestamp + PERIOD + 1);
        vm.prank(buyer);
        vm.expectRevert();
        pass.claim(id);
    }

    // ---- the contract must never promise more than it holds ----
    function test_BackedAmountNeverExceedsThePool() public {
        assertEq(pass.backedPerPass(), 0);
        _buy(buyer);
        assertEq(pass.backedPerPass(), PRICE / 2);
        _buy(other);
        assertEq(pass.backedPerPass(), PRICE / 2);
        assertTrue(pass.backedPerPass() < COVERAGE);
        assertTrue(pass.backedPerPass() * 2 <= pass.poolUsdc());
    }

    function test_BackedAmountIsCappedEvenWhenThePoolIsRich() public {
        CronusAccessPass rich =
            new CronusAccessPass(address(usdc), treasury, address(certificate), 20e6, PERIOD, COVERAGE);
        vm.startPrank(buyer);
        usdc.approve(address(rich), type(uint256).max);
        rich.mint();
        vm.stopPrank();
        assertEq(rich.poolUsdc(), 10e6);
        assertEq(rich.backedPerPass(), COVERAGE);
    }

    // ---- transferable, but the one-pass rule keeps the state readable ----
    function test_TransferMovesAccess() public {
        uint256 id = _buy(buyer);
        vm.prank(buyer);
        pass.transferFrom(buyer, other, id);
        assertEq(pass.ownerOf(id), other);
        assertTrue(pass.hasAccess(other));
        assertEq(pass.hasAccess(buyer), false);
    }

    function test_TransferToSomeoneWhoAlreadyHasOne_Reverts() public {
        uint256 id = _buy(buyer);
        _buy(other);
        vm.prank(buyer);
        vm.expectRevert();
        pass.transferFrom(buyer, other, id);
    }

    // ---- metadata lives on-chain ----
    function test_TokenUriIsSelfContained() public {
        uint256 id = _buy(buyer);
        assertTrue(bytes(pass.tokenURI(id)).length > 500);
    }
}
