// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CronusReputation
/// @notice ERC-8004-style Reputation layer for Trustless Agents on Arc.
///         Clients leave permissionless, on-chain feedback for a provider agent
///         (identified by its ERC-8004 agentId in CronusIdentityRegistry).
///         Feedback is gated to registered identities and de-duplicated per jobRef.
///         Aggregates are naive averages (transparent, no admin, no owner).
interface ICronusIdentity {
    function agentCount() external view returns (uint256);
}

contract CronusReputation {
    address public immutable identityRegistry;

    struct Feedback {
        uint256 providerAgentId;
        address client;
        uint8 score;     // 1..5
        bytes32 jobRef;  // app-level reference (e.g. settlement id hash)
        string uri;      // optional off-chain context
        uint256 timestamp;
    }

    Feedback[] public feedbacks;
    mapping(uint256 => uint256) public feedbackCount; // agentId => count
    mapping(uint256 => uint256) public scoreSum;      // agentId => sum of scores
    mapping(bytes32 => bool) public usedJobRef;       // jobRef => consumed

    event FeedbackGiven(
        uint256 indexed providerAgentId,
        address indexed client,
        uint8 score,
        bytes32 indexed jobRef,
        string uri,
        uint256 timestamp
    );

    error BadScore();
    error UnknownAgent();
    error JobRefUsed();

    constructor(address _identityRegistry) {
        identityRegistry = _identityRegistry;
    }

    /// @notice Leave feedback for a provider agent after a completed job.
    function giveFeedback(uint256 providerAgentId, uint8 score, bytes32 jobRef, string calldata uri)
        external
        returns (uint256 index)
    {
        if (score < 1 || score > 5) revert BadScore();
        if (identityRegistry != address(0)) {
            uint256 count = ICronusIdentity(identityRegistry).agentCount();
            if (providerAgentId == 0 || providerAgentId > count) revert UnknownAgent();
        }
        if (jobRef != bytes32(0)) {
            if (usedJobRef[jobRef]) revert JobRefUsed();
            usedJobRef[jobRef] = true;
        }
        feedbacks.push(Feedback(providerAgentId, msg.sender, score, jobRef, uri, block.timestamp));
        feedbackCount[providerAgentId] += 1;
        scoreSum[providerAgentId] += score;
        index = feedbacks.length - 1;
        emit FeedbackGiven(providerAgentId, msg.sender, score, jobRef, uri, block.timestamp);
    }

    function getFeedbackCount() external view returns (uint256) {
        return feedbacks.length;
    }

    /// @notice Aggregate reputation for a provider agent.
    /// @return count number of feedbacks, sum total score, avgX100 average*100 (0 if none)
    function getReputation(uint256 providerAgentId)
        external
        view
        returns (uint256 count, uint256 sum, uint256 avgX100)
    {
        count = feedbackCount[providerAgentId];
        sum = scoreSum[providerAgentId];
        avgX100 = count == 0 ? 0 : (sum * 100) / count;
    }
}
