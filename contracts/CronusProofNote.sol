// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Cronus Proof Note
/// @notice A small, real Mainnet contract deployed directly by the connected wallet.
contract CronusProofNote {
    address public immutable deployer;
    uint256 public immutable deployedAt;
    string public message;

    event MessageUpdated(address indexed author, string message);

    constructor(string memory initialMessage) {
        deployer = msg.sender;
        deployedAt = block.timestamp;
        message = initialMessage;
        emit MessageUpdated(msg.sender, initialMessage);
    }

    function setMessage(string calldata newMessage) external {
        require(msg.sender == deployer, "CronusProofNote: not deployer");
        message = newMessage;
        emit MessageUpdated(msg.sender, newMessage);
    }
}
