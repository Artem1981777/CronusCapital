// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CronusDecisions {
    struct Decision {
        address oracle;
        string topic;
        string decision;
        uint8 agentId; // 1=Scout 2=Analyst 3=Executor
        uint256 timestamp;
        uint256 confidence;
    }

    Decision[] public decisions;
    mapping(address => uint256[]) public oracleDecisions;
    
    event DecisionLogged(
        address indexed oracle,
        string topic,
        string decision,
        uint8 agentId,
        uint256 timestamp
    );

    function logDecision(
        string memory topic,
        string memory decision,
        uint8 agentId,
        uint256 confidence
    ) external {
        Decision memory d = Decision({
            oracle: msg.sender,
            topic: topic,
            decision: decision,
            agentId: agentId,
            timestamp: block.timestamp,
            confidence: confidence
        });
        decisions.push(d);
        oracleDecisions[msg.sender].push(decisions.length - 1);
        emit DecisionLogged(msg.sender, topic, decision, agentId, block.timestamp);
    }

    function getDecisionsCount() external view returns (uint256) {
        return decisions.length;
    }

    function getMyDecisions() external view returns (uint256[] memory) {
        return oracleDecisions[msg.sender];
    }
}
