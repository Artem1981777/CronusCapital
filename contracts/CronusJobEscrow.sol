// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 a) external returns (bool);
    function transferFrom(address from, address to, uint256 a) external returns (bool);
}
interface IIdentityRegistry {
    function isRegistered(address agent) external view returns (bool);
}

/// @title CronusJobEscrow
/// @notice ERC-8183-style job escrow for agentic commerce. A Client escrows USDC for a job,
///         a Provider submits the result, then funds are released (Client OR optional Evaluator)
///         or refunded after the deadline. Composes with ERC-8004: when an Identity Registry is
///         configured, Providers must hold a registered identity (reputation gate).
contract CronusJobEscrow {
    enum Status { None, Funded, Submitted, Completed, Refunded, Rejected }

    struct Job {
        address client;
        address provider;
        address evaluator;   // optional; address(0) = client-only release
        uint256 amount;
        uint64  deadline;
        uint64  createdAt;
        Status  status;
        string  specURI;
        string  resultURI;
    }

    IERC20 public immutable usdc;
    IIdentityRegistry public immutable identityRegistry; // address(0) disables the gate

    uint256 public jobCount;
    mapping(uint256 => Job) private _jobs;

    uint256 private _locked = 1;
    modifier nonReentrant() { require(_locked == 1, "reentrant"); _locked = 2; _; _locked = 1; }

    event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 amount, uint64 deadline, string specURI);
    event JobSubmitted(uint256 indexed jobId, string resultURI);
    event JobCompleted(uint256 indexed jobId, address indexed provider, uint256 amount);
    event JobRejected(uint256 indexed jobId, address indexed client, uint256 amount);
    event JobRefunded(uint256 indexed jobId, address indexed client, uint256 amount);

    error BadParams();
    error NotFound();
    error NotClient();
    error NotProvider();
    error NotArbiter();
    error BadStatus();
    error NotExpired();
    error ProviderNotRegistered();

    constructor(address _usdc, address _identityRegistry) {
        if (_usdc == address(0)) revert BadParams();
        usdc = IERC20(_usdc);
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    function createJob(address provider, address evaluator, uint256 amount, uint64 deadline, string calldata specURI) external nonReentrant returns (uint256 jobId) {
        if (provider == address(0) || amount == 0 || deadline <= block.timestamp) revert BadParams();
        if (address(identityRegistry) != address(0) && !identityRegistry.isRegistered(provider)) revert ProviderNotRegistered();
        jobId = ++jobCount;
        _jobs[jobId] = Job({
            client: msg.sender, provider: provider, evaluator: evaluator,
            amount: amount, deadline: deadline, createdAt: uint64(block.timestamp),
            status: Status.Funded, specURI: specURI, resultURI: ""
        });
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert BadParams();
        emit JobCreated(jobId, msg.sender, provider, evaluator, amount, deadline, specURI);
    }

    function submit(uint256 jobId, string calldata resultURI) external {
        Job storage j = _jobs[jobId];
        if (j.status == Status.None) revert NotFound();
        if (msg.sender != j.provider) revert NotProvider();
        if (j.status != Status.Funded) revert BadStatus();
        j.resultURI = resultURI;
        j.status = Status.Submitted;
        emit JobSubmitted(jobId, resultURI);
    }

    function release(uint256 jobId) external nonReentrant {
        Job storage j = _jobs[jobId];
        if (j.status == Status.None) revert NotFound();
        if (!_isArbiter(j, msg.sender)) revert NotArbiter();
        if (j.status != Status.Submitted) revert BadStatus();
        j.status = Status.Completed;                  // effects before interaction
        if (!usdc.transfer(j.provider, j.amount)) revert BadParams();
        emit JobCompleted(jobId, j.provider, j.amount);
    }

    function reject(uint256 jobId) external nonReentrant {
        Job storage j = _jobs[jobId];
        if (j.status == Status.None) revert NotFound();
        if (!_isArbiter(j, msg.sender)) revert NotArbiter();
        if (j.status != Status.Submitted) revert BadStatus();
        j.status = Status.Rejected;
        if (!usdc.transfer(j.client, j.amount)) revert BadParams();
        emit JobRejected(jobId, j.client, j.amount);
    }

    function refundExpired(uint256 jobId) external nonReentrant {
        Job storage j = _jobs[jobId];
        if (j.status == Status.None) revert NotFound();
        if (msg.sender != j.client) revert NotClient();
        if (j.status != Status.Funded && j.status != Status.Submitted) revert BadStatus();
        if (block.timestamp < j.deadline) revert NotExpired();
        j.status = Status.Refunded;
        if (!usdc.transfer(j.client, j.amount)) revert BadParams();
        emit JobRefunded(jobId, j.client, j.amount);
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        Job memory j = _jobs[jobId];
        if (j.status == Status.None) revert NotFound();
        return j;
    }

    function _isArbiter(Job storage j, address who) internal view returns (bool) {
        return who == j.client || (j.evaluator != address(0) && who == j.evaluator);
    }
}
