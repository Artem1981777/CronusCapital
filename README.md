# 𓂀 Cronus Capital

**The first AI agent that runs a real business on Arc.**

Cronus is an autonomous oracle that **earns** (x402 paywall), **pays** (per upstream call), **settles** on-chain in USDC, and **reports** its own live revenue — a complete economic loop, not a mockup.

### Live
- App: https://cronus-capital.vercel.app
- Agent contract (Arc Testnet): 0xd81a420BFa4CE8778473BD46195B8E97e928880f
- Explorer: https://testnet.arcscan.app/address/0xd81a420BFa4CE8778473BD46195B8E97e928880f
- Network: Arc Testnet (chain 5042002)

## How it works
1. Consult — 3 reasoning agents analyze a market and reach a verdict.
2. Earn (x402) — premium signals gated behind an x402 paywall; clients pay per call in USDC.
3. Pay — the agent itself pays per upstream inference/data call (agent-to-service nanopayments).
4. Settle — verdicts settle on-chain with a real USDC transaction (FORCE EXECUTE -> arcscan).
5. Report — live revenue bar + on-chain ledger: revenue, paying clients, agent spend, net flow, tx/hr.

## Built on Circle's stack
- x402 pay-per-call monetization (HTTP 402) on Arc
- USDC settlement via Arc Testnet facilitator
- On-chain agent identity surfaced in-app (AGENT ID badge)

## Lepton RFB fit
- RFB 01 — Autonomous paying agents: Cronus spends USDC per call autonomously.
- RFB 02 — Monetize an API/agent: x402 paywall + real revenue metrics.

## Why Cronus is different
Most agent projects show either a marketplace or an identity primitive. Cronus shows a single agent running a full business: it earns, spends, settles, and reports unit economics — all on Arc, all verifiable on-chain.

## Tech
React + Vite + TypeScript · wagmi/viem · Arc Testnet · x402 · Claude (Sonnet) reasoning agents.

## Run locally
Run `npm install` then `npm run dev`.

## Demo flow
Connect wallet (auto-switches to Arc Testnet) -> QUICK CAST a topic -> UNLOCK $0.02 (x402) -> FORCE EXECUTE a real on-chain settlement -> watch REVENUE + ON-CHAIN LEDGER update.

---

# 🏛️ CronusCapital — dashboard guide

The dashboard, top to bottom: what each block means and how to verify it.

## 1. Radar (top) 🛰️
A visualization of the Scout agent scanning prediction markets. Green dots are +EV signals, yellow are neutral. A decorative layer that sets the "oracle scanning the market" theme.

## 2. ⚡ ORACLE ACTIONS

### 🟢 CONSULT ORACLES
Pipeline: **Scout** (signals) → **Analyst** (EV / conviction, Brier calibration) → **Executor** (prepares the settlement). Shows live reasoning logs. This is a reasoning simulation — it does **not** send a payment itself; the real x402 payment is described in the "x402 — pay-per-call" section below.

### 🔵 FORCE EXECUTE
Executes a settlement on-chain. Pre-flight `eth_call` (abort-on-revert) → signature → a real USDC transfer on Arc → "Settlement confirmed" + a link to the tx.

## 3. 🏦 Vault — deposit / yield / withdraw

### DEPOSIT / WITHDRAW
- **DEPOSIT** — `approve` + `deposit` → shares are minted, USDC moves to the contract `0x13B6984357e27dAB17DF44a6396042239e70542C`.
- **WITHDRAW** — `withdrawAll`: burns shares, returns deposit + yield.

### Your position / Vault TVL
- **Your position** — the value of your shares (`convertToAssets(shares)`).
- **Vault TVL** — total capital in the pool (`totalAssets`), visible even without a wallet.

### ⚙ RUN AGENT STRATEGY (yield engine)
The agent books profit: a server-side endpoint, signed by the strategy account, posts realized P&L into the vault via `addYield` → your position and TVL grow live, with a real tx.
Honest note: on testnet the P&L magnitude is modeled (0.02–0.07 USDC), but the share accounting and on-chain distribution are real.

## 4. 🟡 RISK ADJUST
The agent's risk parameters (conviction thresholds, position size).

## 5. VIEW ON ARC ↗
A link to the explorer `testnet.arcscan.app`. Open it in a regular browser (Kiwi/Chrome), not in a wallet's built-in browser.

## 6. + DEPLOY NEW AGENT
A scalability demo — spin up a new agent instance.

## 7. Verifiability panels (the moat)
- **Verifiable Ledger** — a keccak256 hash-chain of decisions, status Verified.
- **Reasoning Trace** — a content commitment of the reasoning, REPRODUCIBLE / MISMATCH badge.
- **Track Record** — hit-rate + Brier score (CALIBRATED).
- **SecOps Panel** — per-tx cap 0.01, daily cap 5.0, 7/7 PASS.
- **ARC NETWORK LIVE** — a live block counter + RPC status.
- **Composability / Moat** — ERC-8183, x402, CCTP, ERC-8004, ERC-4626 + P&L.

## 💸 x402 — pay-per-call (why the wallet shows 2 transactions)

This is the core of monetization (Lepton RFB 02). The premium-signal unlock button (the `X402Integration` component) is a **real paid call** over the x402 protocol: the client/agent pays the Cronus contract in USDC for access to the signal.

- **Recipient contract:** `0xd81a420BFa4CE8778473BD46195B8E97e928880f` (Arc Testnet — the deployed Cronus agent).
- **Price:** ~$0.02 USDC per call.
- **Why two transactions in a row:** the payment is batched (`MEMO + BATCHED PAYMENTS`) — the `useCronusContract` hook makes two contract calls, so the wallet asks for **two signatures**. Both are real on-chain transactions to your contract, visible in the explorer. Sometimes there is only one signature — that's normal: after the first `approve` the allowance is already granted, so the wallet only requests the payment itself (~$0.02).
- In the OKX built-in wallet they appear as "Unknown transaction / could not decode" — that's only because the wallet doesn't have the contract ABI; the call is correct and safe.

> ⚠️ Don't confuse this with **CONSULT ORACLES** on the dashboard: that button runs the reasoning pipeline (Scout → Analyst → Executor) and does **not** send a payment itself. The real x402 payment happens here.
