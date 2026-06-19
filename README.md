# 𓂀 Cronus Capital

**The first AI agent that runs a real business on Arc — it earns, spends, settles, and reports its own P&L on-chain.**

Cronus is an autonomous prediction-market oracle agent. It scans markets, scores expected value with three oracles, and executes settlements in native USDC on Arc. Unlike agents that only *spend*, Cronus **charges for its work and closes the loop net-positive**, with a verifiable trace of every decision.

- **Live demo:** https://cronus-capital.vercel.app
- **Repo:** https://github.com/Artem1981777/CronusCapital
- **Explorer:** https://testnet.arcscan.app
- **Network:** Arc Testnet · chainId 5042002 · native USDC 0x3600...0000 (6 decimals)

---

## Why it matters — RFB 02 (Monetize an API / agent)

Most "agent economy" demos show an agent *paying* for things. Cronus is the other half of the economy: an agent that **gets paid, covers its own costs, and runs a profit** — fully on-chain and auditable.

> Other agents learn to honestly **spend**. Cronus is the agent that **earns**, pays, settles on-chain, and balances its P&L. It is an engine for the agent economy on Arc.

---

## The money loop (all real on-chain)

| Step | Action | On-chain |
|---|---|---|
| **Earn** | Client presses **UNLOCK SIGNAL · \$0.02 (x402)** | real USDC transfer to agent contract 0xd81a420…880f |
| **Pay** | Agent buys upstream data — **PAY UPSTREAM · \$0.005** | real USDC transfer out |
| **Net** | Net Flow = revenue − spend, shown live (green when > 0) | derived from booked tx |
| **Settle** | Decision written to the Verifiable Ledger (keccak hash-chain) | per-action label, Verified badge + tx link |

Demo frame: UNLOCK **+\$0.02** → PAY UPSTREAM **−\$0.005** → **Net Flow +\$0.015**, both with a "view tx" link on arcscan.

---

## How it works — 3 oracles

1. **Scout** — scans prediction markets, gathers signals.
2. **Analyst** — scores EV / conviction, calibrates against track record (Brier score).
3. **Executor** — settles on-chain (USDC transfer) with a pre-flight eth_call simulation and a keccak jobHash.

### Granular reasoning trace

Pressing **CONSULT ORACLES** streams the agent's thinking line by line:

    𓅃 SCOUT · scanning prediction markets…
      ↳ DECOMPOSE · split query into sub-claims
      ↳ DISCOVER · candidate sources in registry
    𓂀 ANALYST · scoring evidence…
      ↳ DECIDE · src#1 EV 0.71 > price → BUY
      ↳ DECIDE · src#2 EV 0.12 < price → SKIP
      ↳ DECIDE · src#3 cached → REUSE
      ↳ SUFFICIENCY · confidence ≥ threshold → STOP (budget saved)
      ↳ ATTRIBUTE · weighted signal contributions
    𓊽 EXECUTOR · settle weighted payouts on Arc…
    ✅ CONSENSUS · verdict · conviction %

This mirrors a real decide → check-budget → attribute pipeline (BUY / SKIP / REUSE), so you can see why the agent paid for what it paid for.

---

## On-chain vault (ERC-4626-style)

A real vault on Arc Testnet: the user signs deposit/withdraw; yield (addYield) accrues into the share price (convertToAssets) — no faucet drip into balances.

- **Vault:** 0x13B6984357e27dAB17DF44a6396042239e70542C
- deposit / withdrawAll / addYield — all transactions visible on the address page.

---

## Verifiable & safe

- **Verifiable Ledger** — keccak256 hash-chain of decisions; **each action is labeled correctly** (x402 revenue / upstream spend / settlement / vault), with a Verified status.
- **Reasoning Trace** — content-commitment of the reasoning chain (keccak256), REPRODUCIBLE badge.
- **Track Record** — forecast history with hit-rate and Brier score.
- **SecOps** — per-tx cap 0.01, daily cap 5.0, recipient allowlist, pre-flight eth_call abort-on-revert.

---

## Standards & composability

| Standard | Role | Status |
|---|---|---|
| ERC-8183 | Job escrow settlement (keccak jobHash) | LIVE |
| x402 | Pay-per-call (~\$0.02 / consult) | LIVE |
| CCTP | Native USDC, domain 7 | LIVE |
| ERC-4626 | On-chain vault, share accounting | LIVE |
| ERC-8004 | Agent registries (identity / reputation / validation) | READY |

---

## What's real vs modeled (honesty)

- ✅ **Real on-chain:** every USDC transfer (x402 earn, upstream spend, vault deposit/withdraw, settlement), the hash-chain ledger, and the pre-flight simulation.
- ⚠️ **Modeled on testnet:** yield magnitudes and EV figures are illustrative — the mechanics, shares, and transactions themselves are real.
- ℹ️ **x402** here is a real USDC transfer to the agent (pay-per-call) — a pragmatic simplification of the full HTTP-402 + facilitator handshake.

---

## Run locally

    npm install
    npm run dev

Connect a wallet on Arc Testnet (chainId 5042002), grab test USDC from the Circle faucet, then try CONSULT → UNLOCK → PAY UPSTREAM → FORCE EXECUTE.

---

**Builder:** Artem Gromov · GitHub @Artem1981777 · ETH gromov7.eth
