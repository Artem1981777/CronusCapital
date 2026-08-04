// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title CronusAgentGuard
/// @notice On-chain containment for an AI agent's operational treasury.
/// The agent (operator) can ONLY call spend(), bounded by a per-tx cap,
/// a rolling 24h cap, and a recipient allowlist. It can never change limits,
/// change the recovery address, or sweep the vault. Even a fully compromised
/// agent key cannot drain funds or send to a brand-new address.
contract CronusAgentGuard {
    IERC20 public immutable usdc;

    address public owner;     // cold key / multisig: full control
    address public operator;  // AI hot key: can only spend() within limits
    address public guardian;  // watcher: can pause() instantly
    address public recovery;  // cold sink: only destination for sweeps

    uint256 public perTxCap;      // max USDC per single spend
    uint256 public dailyCap;      // max USDC per rolling 24h window
    uint256 public spentInWindow;
    uint256 public windowStart;

    bool public paused;
    uint256 private locked = 1; // reentrancy guard

    mapping(address => bool) public allowed; // recipient allowlist

    event Spent(address indexed to, uint256 amount, uint256 spentInWindow);
    event AllowSet(address indexed to, bool allowed);
    event LimitsSet(uint256 perTxCap, uint256 dailyCap);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event Swept(address indexed to, uint256 amount);
    event OperatorSet(address indexed operator);
    event GuardianSet(address indexed guardian);
    event RecoverySet(address indexed recovery);
    event OwnerSet(address indexed owner);
    event Funded(address indexed from, uint256 amount);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier onlyOperator() { require(msg.sender == operator, "not operator"); _; }
    modifier whenNotPaused() { require(!paused, "paused"); _; }
    modifier nonReentrant() {
        require(locked == 1, "reentrant");
        locked = 2;
        _;
        locked = 1;
    }

    constructor(
        address _usdc,
        address _operator,
        address _guardian,
        address _recovery,
        uint256 _perTxCap,
        uint256 _dailyCap
    ) {
        require(_usdc != address(0), "usdc=0");
        require(_recovery != address(0), "recovery=0");
        require(_dailyCap >= _perTxCap, "daily<perTx");
        usdc = IERC20(_usdc);
        owner = msg.sender;
        operator = _operator;
        guardian = _guardian;
        recovery = _recovery;
        perTxCap = _perTxCap;
        dailyCap = _dailyCap;
        windowStart = block.timestamp;
        emit OwnerSet(msg.sender);
        emit OperatorSet(_operator);
        emit GuardianSet(_guardian);
        emit RecoverySet(_recovery);
        emit LimitsSet(_perTxCap, _dailyCap);
    }

    // --- Agent spending path (the ONLY thing the hot key can do) ---
    function spend(address to, uint256 amount)
        external
        onlyOperator
        whenNotPaused
        nonReentrant
        returns (bool)
    {
        require(to != address(0), "to=0");
        require(allowed[to], "recipient not allowlisted");
        require(amount > 0, "zero amount");
        require(amount <= perTxCap, "over per-tx cap");

        if (block.timestamp >= windowStart + 1 days) {
            windowStart = block.timestamp;
            spentInWindow = 0;
        }
        require(spentInWindow + amount <= dailyCap, "over daily cap");
        spentInWindow += amount;

        require(usdc.transfer(to, amount), "transfer failed");
        emit Spent(to, amount, spentInWindow);
        return true;
    }

    // --- Fast circuit breaker: owner OR guardian can pause instantly ---
    function pause() external {
        require(msg.sender == owner || msg.sender == guardian, "not authorized");
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // --- Owner-only configuration (cold key) ---
    function setAllowed(address to, bool ok) external onlyOwner {
        allowed[to] = ok;
        emit AllowSet(to, ok);
    }

    function setLimits(uint256 _perTxCap, uint256 _dailyCap) external onlyOwner {
        require(_dailyCap >= _perTxCap, "daily<perTx");
        perTxCap = _perTxCap;
        dailyCap = _dailyCap;
        emit LimitsSet(_perTxCap, _dailyCap);
    }

    function setOperator(address _operator) external onlyOwner {
        operator = _operator;
        emit OperatorSet(_operator);
    }

    function setGuardian(address _guardian) external onlyOwner {
        guardian = _guardian;
        emit GuardianSet(_guardian);
    }

    function setRecovery(address _recovery) external onlyOwner {
        require(_recovery != address(0), "recovery=0");
        recovery = _recovery;
        emit RecoverySet(_recovery);
    }

    function transferOwnership(address _owner) external onlyOwner {
        require(_owner != address(0), "owner=0");
        owner = _owner;
        emit OwnerSet(_owner);
    }

    // --- Funding & recovery ---
    function fund(uint256 amount) external nonReentrant {
        require(amount > 0, "zero amount");
        require(usdc.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        emit Funded(msg.sender, amount);
    }

    /// @notice The ONLY way the full balance can leave: to the fixed cold recovery
    /// address. Not callable by the operator.
    function sweepToRecovery() external onlyOwner nonReentrant returns (uint256 amount) {
        amount = usdc.balanceOf(address(this));
        require(amount > 0, "nothing to sweep");
        require(usdc.transfer(recovery, amount), "transfer failed");
        emit Swept(recovery, amount);
    }

    // --- Views ---
    function available() external view returns (uint256) {
        uint256 bal = usdc.balanceOf(address(this));
        uint256 spent = block.timestamp >= windowStart + 1 days ? 0 : spentInWindow;
        uint256 room = dailyCap > spent ? dailyCap - spent : 0;
        uint256 cap = room < perTxCap ? room : perTxCap;
        return cap < bal ? cap : bal;
    }
}
