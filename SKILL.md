# SKILL: Cronus Capital Oracle

Cronus is an autonomous, self-sustaining market-intelligence agent on the Arc network. It reasons over live market data with a real LLM, sells its signals via x402, spends on upstream data, settles on-chain in native USDC, and reports its own P&L - all non-custodially (it never holds your private key).

## What an agent or LLM can do with Cronus

1. Query the oracle for a live, reasoned trade decision.
2. Pay per signal via x402 (pay-per-call) to unlock premium signals.
3. Verify every decision on-chain via the keccak hash-chain ledger.

## Endpoint: live reasoned decision

    GET https://cronus-capital.vercel.app/api/consult?instId=BTC-USDC&topic=BTC-USDC%20momentum

Query params:
- instId  - market id on OKX (default BTC-USDC)
- topic   - free-text intent (optional)

Returns JSON:

    {
      "ok": true,
      "live": true,
      "price": 63070.6,
      "changePct": 0.31,
      "high24h": 63359.9,
      "low24h": 62275.1,
      "vol24h": 37.27,
      "trace": ["SCOUT: ...", "DECIDE: ...", "EXECUTOR: ..."],
      "analog": { "regime": "Bull", "outcome": "continued upward", "similarity": 0.70 },
      "verdict": "SKIP",
      "conviction": 58,
      "decisions": [ { "src": "Cronus", "ev": 0.58, "price": 63070.6, "action": "SKIP" } ]
    }

Field notes:
- price / changePct / high24h / low24h / vol24h are REAL data pulled live from the OKX public ticker.
- trace is produced by a real LLM (Groq, Llama 3.3 70B) reasoning ONLY over the provided data; it never invents indicators.
- analog is a heuristic historical-regime recall (an estimate, not a backtest).
- verdict is YES / NO / SKIP. Cronus abstains (SKIP) when conviction is below 65 - it is not a YES-machine.

## Paying for premium signals (x402)

Premium / unlocked signals settle as a real USDC micro-payment on Arc:
- UNLOCK SIGNAL: 0.02 USDC to the agent contract (x402 pay-per-call).
- The agent itself pays upstream for data (PAY UPSTREAM: 0.005 USDC), closing an earn -> spend -> net loop.

## Safety model (why Cronus is safe to call)

- Non-custodial: every settlement is signed in the user's own wallet. No private key sits on any Cronus server - an agent cannot run off with funds it never controls.
- Hard caps: per-tx cap 0.01 USDC, daily cap 5.0 USDC.
- Recipient allowlist: funds can only move to the single allowlisted settlement target.
- Pre-flight: every settlement is simulated with eth_call and aborts on revert.
- Verifiable ledger: each action is recorded in a keccak256 hash-chain with a Verified status.

## Network

- Arc Testnet - chainId 5042002 - native USDC 0x3600...0000 (6 decimals)
- Explorer: https://testnet.arcscan.app

## Builder

Artem Gromov - GitHub @Artem1981777
