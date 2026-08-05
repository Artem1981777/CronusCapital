// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CronusMultisig
/// @notice Minimal M-of-N multisig, meant to own CronusAgentGuardV2 (or any target).
/// @dev No admin backdoor: owners/threshold change only via a confirmed tx to this contract itself.
contract CronusMultisig {
    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public threshold;

    struct Tx {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 confirmations;
    }
    Tx[] public txs;
    mapping(uint256 => mapping(address => bool)) public confirmed;

    event Submit(uint256 indexed id, address indexed by, address to, uint256 value, bytes data);
    event Confirm(uint256 indexed id, address indexed by);
    event Revoke(uint256 indexed id, address indexed by);
    event Execute(uint256 indexed id);
    event OwnerAdded(address indexed owner);
    event OwnerRemoved(address indexed owner);
    event ThresholdSet(uint256 threshold);
    event Deposit(address indexed from, uint256 amount);

    modifier onlyOwner() { require(isOwner[msg.sender], "not owner"); _; }
    modifier onlyWallet() { require(msg.sender == address(this), "not wallet"); _; }
    modifier txExists(uint256 id) { require(id < txs.length, "no tx"); _; }
    modifier notExecuted(uint256 id) { require(!txs[id].executed, "executed"); _; }

    constructor(address[] memory _owners, uint256 _threshold) {
        require(_owners.length > 0, "no owners");
        require(_threshold > 0 && _threshold <= _owners.length, "bad threshold");
        for (uint256 i = 0; i < _owners.length; i++) {
            address o = _owners[i];
            require(o != address(0) && !isOwner[o], "bad owner");
            isOwner[o] = true;
            owners.push(o);
        }
        threshold = _threshold;
    }

    receive() external payable { if (msg.value > 0) emit Deposit(msg.sender, msg.value); }

    function submit(address to, uint256 value, bytes calldata data) external onlyOwner returns (uint256 id) {
        id = txs.length;
        txs.push(Tx({to: to, value: value, data: data, executed: false, confirmations: 0}));
        emit Submit(id, msg.sender, to, value, data);
        _confirm(id); // submitter auto-confirms
    }

    function confirm(uint256 id) external onlyOwner txExists(id) notExecuted(id) { _confirm(id); }

    function _confirm(uint256 id) internal {
        require(!confirmed[id][msg.sender], "already confirmed");
        confirmed[id][msg.sender] = true;
        txs[id].confirmations += 1;
        emit Confirm(id, msg.sender);
    }

    function revoke(uint256 id) external onlyOwner txExists(id) notExecuted(id) {
        require(confirmed[id][msg.sender], "not confirmed");
        confirmed[id][msg.sender] = false;
        txs[id].confirmations -= 1;
        emit Revoke(id, msg.sender);
    }

    function execute(uint256 id) external onlyOwner txExists(id) notExecuted(id) {
        Tx storage t = txs[id];
        require(t.confirmations >= threshold, "not enough confirmations");
        t.executed = true;
        (bool ok, ) = t.to.call{value: t.value}(t.data);
        require(ok, "call failed");
        emit Execute(id);
    }

    // ---- self-administered management (only via a confirmed tx to self) ----
    function addOwner(address o) external onlyWallet {
        require(o != address(0) && !isOwner[o], "bad owner");
        isOwner[o] = true;
        owners.push(o);
        emit OwnerAdded(o);
    }

    function removeOwner(address o) external onlyWallet {
        require(isOwner[o], "not owner");
        require(owners.length - 1 >= threshold, "threshold too high");
        isOwner[o] = false;
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == o) { owners[i] = owners[owners.length - 1]; owners.pop(); break; }
        }
        emit OwnerRemoved(o);
    }

    function setThreshold(uint256 t) external onlyWallet {
        require(t > 0 && t <= owners.length, "bad threshold");
        threshold = t;
        emit ThresholdSet(t);
    }

    function ownersCount() external view returns (uint256) { return owners.length; }
    function txCount() external view returns (uint256) { return txs.length; }
}
