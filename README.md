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
