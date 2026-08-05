// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

/// @title CronusAgentGuardV2
/// @notice Containment for autonomous agent spending, with a governance "terminator"
///  that ends the infinite "who controls the controller" regress:
///   - immutable hard caps that even the owner cannot exceed
///   - a timelock on every owner action (public + vetoable during the delay)
///   - a guardian with negative-only power (pause + veto + de-allowlist)
///   - an immutable cold recovery address that can always pull funds home (exit)
///   - renounceable ownership to freeze the rules forever
contract CronusAgentGuardV2 {
    IERC20 public immutable token;
    address public immutable recovery;        // immutable exit sink (cold)
    uint256 public immutable MAX_PER_TX_CAP;   // hard ceiling; caps can never exceed this
    uint256 public immutable MAX_DAILY_CAP;
    uint256 public immutable timelockDelay;

    address public owner;                      // should be an M-of-N multisig (Safe)
    address public operator;                   // AI hot key: spend() only
    address public guardian;                   // negative power only

    uint256 public perTxCap;
    uint256 public dailyCap;
    uint256 public spentInWindow;
    uint256 public windowStart;
    bool public paused;

    mapping(address => bool) public allowed;
    mapping(bytes32 => uint256) public opEta;  // 0 = not queued
    uint256 private locked = 1;

    event Spent(address indexed to, uint256 amount, uint256 spentInWindow);
    event AllowSet(address indexed who, bool allowed);
    event LimitsSet(uint256 perTxCap, uint256 dailyCap);
    event OperatorSet(address indexed operator);
    event GuardianSet(address indexed guardian);
    event OwnerSet(address indexed owner);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event EmergencyExit(address indexed to, uint256 amount);
    event Funded(address indexed from, uint256 amount);
    event OpQueued(bytes32 indexed id, bytes data, bytes32 salt, uint256 eta);
    event OpExecuted(bytes32 indexed id);
    event OpCanceled(bytes32 indexed id, address by);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier onlyThis() { require(msg.sender == address(this), "not self"); _; }
    modifier onlyOperator() { require(msg.sender == operator, "not operator"); _; }
    modifier whenNotPaused() { require(!paused, "paused"); _; }
    modifier nonReentrant() { require(locked == 1, "reentrant"); locked = 2; _; locked = 1; }

    constructor(
        address _token,
        address _owner,
        address _operator,
        address _guardian,
        address _recovery,
        uint256 _perTxCap,
        uint256 _dailyCap,
        uint256 _maxPerTxCap,
        uint256 _maxDailyCap,
        uint256 _timelockDelay
    ) {
        require(_token != address(0) && _owner != address(0) && _recovery != address(0), "zero addr");
        require(_perTxCap <= _maxPerTxCap && _dailyCap <= _maxDailyCap, "over hard cap");
        token = IERC20(_token);
        owner = _owner;
        operator = _operator;
        guardian = _guardian;
        recovery = _recovery;
        perTxCap = _perTxCap;
        dailyCap = _dailyCap;
        MAX_PER_TX_CAP = _maxPerTxCap;
        MAX_DAILY_CAP = _maxDailyCap;
        timelockDelay = _timelockDelay;
        windowStart = block.timestamp;
    }

    // ---- operator: the only positive-power path, tightly bounded ----
    function spend(address to, uint256 amount) external onlyOperator whenNotPaused nonReentrant returns (bool) {
        require(allowed[to], "recipient not allowlisted");
        require(amount <= perTxCap, "over per-tx cap");
        if (block.timestamp >= windowStart + 1 days) { windowStart = block.timestamp; spentInWindow = 0; }
        require(spentInWindow + amount <= dailyCap, "over daily cap");
        spentInWindow += amount;
        require(token.transfer(to, amount), "transfer failed");
        emit Spent(to, amount, spentInWindow);
        return true;
    }

    function available() external view returns (uint256) {
        uint256 sw = spentInWindow;
        if (block.timestamp >= windowStart + 1 days) sw = 0;
        uint256 room = dailyCap > sw ? dailyCap - sw : 0;
        return room < perTxCap ? room : perTxCap;
    }

    // ---- guardian: negative power only (fail-safe) ----
    function pause() external { require(msg.sender == owner || msg.sender == guardian, "not authorized"); paused = true; emit Paused(msg.sender); }
    function removeAllowed(address who) external { require(msg.sender == owner || msg.sender == guardian, "not authorized"); allowed[who] = false; emit AllowSet(who, false); }
    function cancel(bytes32 id) external { require(msg.sender == owner || msg.sender == guardian, "not authorized"); require(opEta[id] != 0, "unknown op"); delete opEta[id]; emit OpCanceled(id, msg.sender); }

    // ---- exit: immutable cold recovery can always pull funds home ----
    function emergencyExit() external nonReentrant {
        require(msg.sender == owner || msg.sender == recovery, "not authorized");
        uint256 bal = token.balanceOf(address(this));
        require(bal > 0, "nothing to exit");
        require(token.transfer(recovery, bal), "transfer failed");
        emit EmergencyExit(recovery, bal);
    }

    // ---- owner immediate (safe) ----
    function unpause() external onlyOwner { paused = false; emit Unpaused(msg.sender); }

    // ---- funding ----
    function fund(uint256 amount) external { require(token.transferFrom(msg.sender, address(this), amount), "transferFrom failed"); emit Funded(msg.sender, amount); }

    // ---- timelock: every owner mutation goes through queue -> delay -> execute ----
    function queue(bytes calldata data, bytes32 salt) external onlyOwner returns (bytes32 id) {
        id = keccak256(abi.encode(data, salt));
        require(opEta[id] == 0, "dup op");
        uint256 eta = block.timestamp + timelockDelay;
        opEta[id] = eta;
        emit OpQueued(id, data, salt, eta);
    }

    function execute(bytes calldata data, bytes32 salt) external onlyOwner nonReentrant returns (bytes memory) {
        bytes32 id = keccak256(abi.encode(data, salt));
        uint256 eta = opEta[id];
        require(eta != 0, "not queued");
        require(block.timestamp >= eta, "timelock");
        delete opEta[id];
        (bool ok, bytes memory ret) = address(this).call(data);
        require(ok, "exec failed");
        emit OpExecuted(id);
        return ret;
    }

    // ---- privileged setters: only callable by the contract itself (via execute) ----
    function extSetLimits(uint256 _perTxCap, uint256 _dailyCap) external onlyThis {
        require(_perTxCap <= MAX_PER_TX_CAP && _dailyCap <= MAX_DAILY_CAP, "over hard cap");
        perTxCap = _perTxCap; dailyCap = _dailyCap; emit LimitsSet(_perTxCap, _dailyCap);
    }
    function extAddAllowed(address who) external onlyThis { allowed[who] = true; emit AllowSet(who, true); }
    function extSetOperator(address _op) external onlyThis { operator = _op; emit OperatorSet(_op); }
    function extSetGuardian(address _g) external onlyThis { guardian = _g; emit GuardianSet(_g); }
    function extTransferOwnership(address _o) external onlyThis { require(_o != address(0), "zero"); owner = _o; emit OwnerSet(_o); }
    function extRenounceOwnership() external onlyThis { owner = address(0); emit OwnerSet(address(0)); }
}
