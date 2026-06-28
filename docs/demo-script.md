# Cronus Capital — 3-Minute Demo Script

**Round:** Canteen × Circle · Arc testnet · centers Circle Gateway nanopayments
**Live:** https://cronus-capital.vercel.app · **Repo:** https://github.com/Artem1981777/CronusCapital · **Explorer:** https://testnet.arcscan.app

## TL;DR (one breath)
Cronus is an autonomous oracle agent that **earns** on Arc: it sells trading signals per call, pays for its own upstream data, settles in USDC, and reports its P&L on-chain. It now also sells a **sub-cent NANO tier settled gas-free via Circle Gateway**, consumed by an autonomous A2A buyer-agent — with strictly honest traction labeling.

## 0:00–0:30 — Hook
- Open the live dashboard: "This agent runs a real business on Arc."
- Money loop: Earn ($0.02 x402) → Pay upstream ($0.005) → Net flow (green) → Settle (on-chain, verifiable).

## 0:30–1:30 — NANO nanopayments (Circle Gateway centerpiece)
- Show the NANO panel: gas-free · Circle Gateway · $0.001/call.
- Terminal: `node scripts/buyer-agent.mjs --max-usd 0.01`
- Narrate: discover from /api/manifest → budget guard → sign EIP-3009 offchain → Circle Gateway settles gas-free → consume signal (verdict + conviction).
- Refresh /api/traction: nano calls increment live.

## 1:30–2:15 — The honesty edge
- Buyer-agent is self-funded → registered in SELF_DEMO_ADDRESSES → counted as self_demo_calls, NOT unique_external_payers.
- /api/leaderboard stays EMPTY until a real third party pays. No self-padding.
- Batching shown as a Circle Gateway protocol capability; on testnet it settles 1:1 — and we say so.
- Gateway settlement IDs labeled pending; arcscan /tx/ links only for real on-chain hashes.

## 2:15–2:45 — Trust stack (verifiable)
- STANDARD x402: 90+ real on-chain USDC payments, read live from the Arc explorer (/api/metrics, /api/receipts).
- ERC-8004 Identity (0x252c…b6c) + ERC-8183 Job Escrow (0x64e5…873) live on Arc.
- keccak hash-chain ledger; non-custodial spend (signed in user wallet).

## 2:45–3:00 — Close
- "A real earning agent + honest, verifiable nanopayments on Circle Gateway. Every number on screen is live on-chain data or an explicitly labeled capability — nothing faked."

## Appendix (off-camera)
- Balance: `node scripts/buyer-agent.mjs --status`
- One-time deposit: `node scripts/buyer-agent.mjs --deposit 1`
- Faucet: https://faucet.circle.com (Arc testnet, USDC)
