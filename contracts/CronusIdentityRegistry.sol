// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CronusIdentityRegistry
/// @notice ERC-8004-style Identity Registry (the "Identity" layer of the Trustless Agents stack).
///         Each agent gets a persistent on-chain id linked to its address, domain and a
///         metadata/registration-file URI (agent card: capabilities, endpoints, ownership).
///         x402 sellers can resolve an agent's identity before serving it (reputation gate);
///         reputation/decisions (see CronusDecisions) compose off this id.
contract CronusIdentityRegistry {
    struct Agent {
        uint256 agentId;
        address agentAddress;   // agent's operational/signing address
        string  agentDomain;    // e.g. cronus-capital.vercel.app
        string  metadataURI;    // registration file / agent card URI
        address owner;          // controls updates/transfer of this record
        uint256 registeredAt;
        uint256 updatedAt;
    }

    uint256 public agentCount;
    mapping(uint256 => Agent) private _agents;            // agentId => Agent
    mapping(address => uint256) public agentIdByAddress;  // agentAddress => agentId (0 = none)

    event AgentRegistered(uint256 indexed agentId, address indexed agentAddress, string agentDomain, string metadataURI, address indexed owner);
    event AgentUpdated(uint256 indexed agentId, address agentAddress, string agentDomain, string metadataURI);
    event AgentTransferred(uint256 indexed agentId, address indexed previousOwner, address indexed newOwner);

    error AlreadyRegistered();
    error NotRegistered();
    error NotOwner();
    error ZeroAddress();

    /// @notice Register a new agent. Each agentAddress may be registered once. ids start at 1.
    function register(address agentAddress, string calldata agentDomain, string calldata metadataURI) external returns (uint256 agentId) {
        if (agentAddress == address(0)) revert ZeroAddress();
        if (agentIdByAddress[agentAddress] != 0) revert AlreadyRegistered();
        agentId = ++agentCount;
        _agents[agentId] = Agent({
            agentId: agentId,
            agentAddress: agentAddress,
            agentDomain: agentDomain,
            metadataURI: metadataURI,
            owner: msg.sender,
            registeredAt: block.timestamp,
            updatedAt: block.timestamp
        });
        agentIdByAddress[agentAddress] = agentId;
        emit AgentRegistered(agentId, agentAddress, agentDomain, metadataURI, msg.sender);
    }

    /// @notice Update an existing agent record (owner only).
    function updateAgent(uint256 agentId, address agentAddress, string calldata agentDomain, string calldata metadataURI) external {
        Agent storage a = _agents[agentId];
        if (a.agentId == 0) revert NotRegistered();
        if (a.owner != msg.sender) revert NotOwner();
        if (agentAddress == address(0)) revert ZeroAddress();
        if (agentAddress != a.agentAddress) {
            if (agentIdByAddress[agentAddress] != 0) revert AlreadyRegistered();
            agentIdByAddress[a.agentAddress] = 0;
            agentIdByAddress[agentAddress] = agentId;
            a.agentAddress = agentAddress;
        }
        a.agentDomain = agentDomain;
        a.metadataURI = metadataURI;
        a.updatedAt = block.timestamp;
        emit AgentUpdated(agentId, agentAddress, agentDomain, metadataURI);
    }

    /// @notice Transfer ownership of an agent record (owner only).
    function transferAgent(uint256 agentId, address newOwner) external {
        Agent storage a = _agents[agentId];
        if (a.agentId == 0) revert NotRegistered();
        if (a.owner != msg.sender) revert NotOwner();
        if (newOwner == address(0)) revert ZeroAddress();
        address prev = a.owner;
        a.owner = newOwner;
        emit AgentTransferred(agentId, prev, newOwner);
    }

    // ---- resolvers: discovery / reputation-gate surface ----
    function resolveById(uint256 agentId) external view returns (Agent memory) {
        Agent memory a = _agents[agentId];
        if (a.agentId == 0) revert NotRegistered();
        return a;
    }
    function resolveByAddress(address agentAddress) external view returns (Agent memory) {
        uint256 id = agentIdByAddress[agentAddress];
        if (id == 0) revert NotRegistered();
        return _agents[id];
    }
    function isRegistered(address agentAddress) external view returns (bool) {
        return agentIdByAddress[agentAddress] != 0;
    }
}
