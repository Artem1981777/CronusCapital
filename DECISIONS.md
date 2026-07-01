# Cronus Capital — Decision Log

Short ADR-style record of the key architecture and economic decisions, with trade-offs.

## 1. Payments rail: x402 + Circle Gateway nanopayments on Arc
Standard signals settle via x402 (0.02 USDC, EIP-3009). The core rail is Circle Gateway nanopayments (~0.001 USDC) for per-call agent micropayments. Arc's native gas token IS USDC, so there is no separate gas asset to manage.

## 2. Honest metric separation (self vs external)
We split self-generated volume from external demand at the data layer (`lib/traction.js`) and never blend them. `external_payers` requires an allow-listed, non-self, on-chain payer. This is the project's core differentiator.

## 3. Deterministic, content-addressed reasoning
`/api/consult` runs at temperature 0 with a fixed seed; each run is hashed (sha256 `traceHash`) and archived, and `/api/trace?hash=` re-hashes the stored record to re-verify its own address. Tamper-evident, not clairvoyant.

## 4. Money safety enforced in code, non-custodial
Spend caps are enforced by the orchestrator, not the LLM. The autonomous payout path is bounded by a per-payout cap, a shared daily circuit breaker (`PAYOUT_DAILY_BREAKER`), and a KV exec-lock. No user funds are ever custodied.

## 5. Second independent price source
`/api/consult` cross-checks the primary OKX price against Coinbase spot; the `crossCheck` field is additive and never changes the verdict (fail-open).

## 6. Skin-in-the-game + honest backtest
On-chain stakes (`lib/stake.js` / `openStake.js` / `resolveStake.js`) commit conviction before outcomes are known. `/api/backtest` scores ONLY Cronus's own on-chain-resolved stakes (Brier + calibration); with no resolved positions the score stays `null` — never backfilled.

## 7. Distribution as MCP tools + CLI
Cronus ships as `cronus-mcp` on npm and in the MCP registry, exposing `cronus_consult` / `cronus_signal` / `cronus_nano_signal` / `cronus_pay`, plus a one-shot CLI. Thin proxy over the live API — no duplicated logic.

## 8. No new serverless functions
To stay under Vercel's 12-function cap, new endpoints (backtest, trace, traction, receipts, …) route through a single `/api/info` dispatcher instead of adding files.

## 9. Arc-native receipts, no extra registry contract
Each paid call is listed at `/api/receipts` (JSON), backed by on-chain settlement — verifiable history without a separate registry contract.
