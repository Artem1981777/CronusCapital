// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./Harness.sol";
import "../CronusReputation.sol";
import "../CronusIdentityRegistry.sol";

contract ReputationTest is Test {
    CronusIdentityRegistry reg;
    CronusReputation rep;
    function setUp() public {
        reg = new CronusIdentityRegistry();
        reg.register(address(0xA1), "d", "u");
        rep = new CronusReputation(address(reg));
    }
    function test_FeedbackAggregates() public {
        rep.giveFeedback(1, 5, bytes32("job1"), "uri");
        rep.giveFeedback(1, 3, bytes32("job2"), "uri2");
        (uint256 count, uint256 sum, uint256 avgX100) = rep.getReputation(1);
        assertEq(count, 2);
        assertEq(sum, 8);
        assertEq(avgX100, 400);
        assertEq(rep.getFeedbackCount(), 2);
    }
    function test_BadScoreLowReverts() public {
        vm.expectRevert(CronusReputation.BadScore.selector);
        rep.giveFeedback(1, 0, bytes32(0), "");
    }
    function test_BadScoreHighReverts() public {
        vm.expectRevert(CronusReputation.BadScore.selector);
        rep.giveFeedback(1, 6, bytes32(0), "");
    }
    function test_UnknownAgentReverts() public {
        vm.expectRevert(CronusReputation.UnknownAgent.selector);
        rep.giveFeedback(99, 5, bytes32(0), "");
    }
    function test_JobRefDedup() public {
        rep.giveFeedback(1, 5, bytes32("dup"), "");
        vm.expectRevert(CronusReputation.JobRefUsed.selector);
        rep.giveFeedback(1, 4, bytes32("dup"), "");
    }
    function test_ZeroJobRefNotDeduped() public {
        rep.giveFeedback(1, 5, bytes32(0), "");
        rep.giveFeedback(1, 4, bytes32(0), "");
        (uint256 count,,) = rep.getReputation(1);
        assertEq(count, 2);
    }
}
