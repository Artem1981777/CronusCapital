# Cronus Cover — parametric micro-insurance (hackathon module)

**What:** an autonomous insurance agent on Arc. It prices risk with live market data,
sells price-drop protection for USDC micro-premiums, commits every policy on-chain
(keccak256) BEFORE the outcome, and pays out automatically at expiry. No claims,
no paperwork — parametric settlement.

**Why it matters:** insurance is the classic "agentic economy" product — an agent that
autonomously quotes, collects premiums, and pays obligations under hard spending caps.
Built additively next to the Cronus oracle: zero changes to existing behavior.

## Flow
1. `GET /api/cover?action=quote&market=BTC-USDC&threshold=2` — oracle prices the premium
   (24h-range heuristic, honestly labeled as an estimate; loading factor 1.5x).
2. `POST /api/cover?action=buy` — premium paid in USDC to treasury (x402-style, verified
   on-chain via tx logs), policy committed with keccak256 before the outcome. Demo policies
   are labeled `demo:true` and never counted as real demand.
3. `GET /api/cover?action=resolve` — dry-run preview; `POST` + `Bearer CRON_SECRET` —
   executes: OKX settlement price vs committed open price; triggered -> USDC payout to buyer.

## Safety rails (inherited from Cronus)
- Per-policy payout cap: `COVER_MAX_PAYOUT` (default 0.05 USDC, testnet-safe)
- Daily payout cap: `COVER_DAILY_CAP` (default 0.25 USDC)
- Commitment before outcome; ledger in KV; every payout is an on-chain USDC transfer with explorer link.

## Architecture (additive)
- `lib/cover.js` — engine (quote/buy/resolve/ledger), routed via `api/info.js?kind=cover`
  (stays within the Vercel Hobby 12-function cap)
- `/api/cover` — public URL via vercel.json rewrite
- `src/components/CoverPanel.tsx` — UI section `#/cover` in Dashboard V2
- `scripts/cover-smoke.mjs` — local smoke test
