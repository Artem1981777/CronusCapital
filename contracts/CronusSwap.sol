// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// A constant-product AMM on Arc, written from scratch.
//
// Honesty note, because this is easy to overstate: this is OUR pool, holding OUR
// liquidity, quoting OUR token against USDC. It is not an integration with a
// third-party DEX, because Arc testnet has none. What it does prove is that the
// swap path is real: reserves live on-chain, the price moves with every trade,
// and nothing is simulated off-chain.
//
// USYC is deliberately not used here. It is a permissioned token, and the
// entitlements contract answers false for our address, so any swap against it
// would revert. We prove that refusal elsewhere rather than faking a position.

contract CronusToken {
    string public constant name = "Cronus Test Token";
    string public constant symbol = "CRN";
    // Matches USDC on Arc, so amounts in the pool are directly comparable.
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // Supply is fixed at construction. No mint function exists, so the deployer
    // cannot dilute a trader after the pool is funded.
    constructor(uint256 initialSupply) {
        totalSupply = initialSupply;
        balanceOf[msg.sender] = initialSupply;
        emit Transfer(address(0), msg.sender, initialSupply);
    }

    function transfer(address to, uint256 v) external returns (bool) {
        _transfer(msg.sender, to, v);
        return true;
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        emit Approval(msg.sender, s, v);
        return true;
    }

    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        require(a >= v, "allowance");
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
        _transfer(f, to, v);
        return true;
    }

    function _transfer(address f, address t, uint256 v) internal {
        require(t != address(0), "to_zero");
        require(balanceOf[f] >= v, "balance");
        unchecked { balanceOf[f] -= v; }
        balanceOf[t] += v;
        emit Transfer(f, t, v);
    }
}

interface IERC20 {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address f, address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

contract CronusSwap {
    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;
    address public immutable owner;

    // Reserves are tracked internally rather than read from balanceOf. If they were
    // read from balances, anyone could donate tokens to the pool and shift the price
    // without trading, which is a known way to grief a naive AMM.
    uint256 public reserveA;
    uint256 public reserveB;

    uint256 public constant FEE_BPS = 30; // 0.3%, the original Uniswap fee

    event LiquidityAdded(uint256 amountA, uint256 amountB, uint256 reserveA, uint256 reserveB);
    event LiquidityRemoved(uint256 amountA, uint256 amountB, uint256 reserveA, uint256 reserveB);
    event Swap(address indexed trader, address indexed tokenIn, uint256 amountIn, uint256 amountOut);

    constructor(address a, address b) {
        require(a != address(0) && b != address(0) && a != b, "tokens");
        tokenA = IERC20(a);
        tokenB = IERC20(b);
        owner = msg.sender;
    }

    // x * y = k, with the fee taken off the input before it is priced.
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public pure returns (uint256)
    {
        require(amountIn > 0, "amount_zero");
        require(reserveIn > 0 && reserveOut > 0, "no_liquidity");
        uint256 inWithFee = amountIn * (10000 - FEE_BPS);
        return (inWithFee * reserveOut) / (reserveIn * 10000 + inWithFee);
    }

    function quote(address tokenIn, uint256 amountIn) external view returns (uint256) {
        bool aIn = tokenIn == address(tokenA);
        require(aIn || tokenIn == address(tokenB), "token");
        return aIn ? getAmountOut(amountIn, reserveA, reserveB)
                   : getAmountOut(amountIn, reserveB, reserveA);
    }

    function addLiquidity(uint256 amountA, uint256 amountB) external {
        require(msg.sender == owner, "owner");
        require(amountA > 0 && amountB > 0, "amount");
        require(tokenA.transferFrom(msg.sender, address(this), amountA), "pull_a");
        require(tokenB.transferFrom(msg.sender, address(this), amountB), "pull_b");
        reserveA += amountA;
        reserveB += amountB;
        emit LiquidityAdded(amountA, amountB, reserveA, reserveB);
    }

    function removeLiquidity(uint256 amountA, uint256 amountB, address to) external {
        require(msg.sender == owner, "owner");
        require(to != address(0), "to_zero");
        require(amountA <= reserveA && amountB <= reserveB, "reserves");
        reserveA -= amountA;
        reserveB -= amountB;
        if (amountA > 0) require(tokenA.transfer(to, amountA), "push_a");
        if (amountB > 0) require(tokenB.transfer(to, amountB), "push_b");
        emit LiquidityRemoved(amountA, amountB, reserveA, reserveB);
    }

    // minOut is not optional in spirit: pass a real number. Passing zero means
    // accepting any price, which on a thin pool means accepting any loss.
    function swapExactIn(address tokenIn, uint256 amountIn, uint256 minOut, address to)
        external returns (uint256 out)
    {
        require(to != address(0), "to_zero");
        bool aIn = tokenIn == address(tokenA);
        require(aIn || tokenIn == address(tokenB), "token");

        uint256 kBefore = reserveA * reserveB;
        out = aIn ? getAmountOut(amountIn, reserveA, reserveB)
                  : getAmountOut(amountIn, reserveB, reserveA);
        require(out >= minOut, "slippage");

        // State is updated before the outgoing transfer so a hostile token that
        // calls back into this contract cannot see stale reserves.
        if (aIn) { reserveA += amountIn; reserveB -= out; }
        else     { reserveB += amountIn; reserveA -= out; }

        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "pull_in");
        require((aIn ? tokenB : tokenA).transfer(to, out), "push_out");

        // The fee must make the invariant grow, never shrink. If this ever fails,
        // the pricing maths is wrong and the pool is being drained.
        require(reserveA * reserveB >= kBefore, "k");
        emit Swap(msg.sender, tokenIn, amountIn, out);
    }
}
