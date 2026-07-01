# Changelog — Cronus Capital (Lepton nanopayments polish)

All changes verified on Arc Testnet (chainId 5042002). Self-funded demo traffic is labeled and excluded from external metrics — we never fake demand.

## Creator payout layer behind flag (2026-07-01)

- **New `lib/creatorRegistry.js`** - pure, zero-dependency, and OFF by default behind the `CREATOR_LAYER` flag. Sits on top of the existing basis-point split engine (`lib/splitPay.js`) without modifying it.
  - `resolveCreatorSplit()` - validates an allow-listed creator registry (shares must sum to 10000 bps) and returns a deterministic allocation; the last recipient absorbs rounding so no dust is lost.
  - `assertAllowListed()` - refuses to pay any address that is not a registered creator.
  - It only DECIDES a split: it never signs, burns, or moves funds, and is completely inert unless `CREATOR_LAYER` is explicitly turned on.
- Additive and honest: no fabricated payouts or demand; a foundation to wire into the signed split path later, behind the flag, once real creators exist. Covered by `test/creatorRegistry.test.mjs`.

## Forkable OSS primitives expanded (2026-07-01)

- **Two new MIT primitives** in `arc-primitives/` (zero-dependency, standalone):
  - `spend-breaker.mjs` - pure `decideSpend()` + in-memory `createBreaker()`: money safety enforced in code, not by the model; a hallucinated amount can never exceed the cap. Ships a deterministic `selftest`.
  - `price-crosscheck.mjs` - `crossCheck()` corroborates a primary price against an independent Coinbase spot, reporting spread and agreement within a tolerance band; advisory and fail-open (never fabricates a price).
- The package now offers four forkable primitives: prove payment, pay with reconcilable context, cap spend, cross-check price. (`846095b`)

## Honest on-chain track record (2026-07-01)

- **Removed a fabricated seed from the UI** - `src/components/TrackRecord.tsx` previously computed hit-rate/Brier/calibration from a hard-coded array of made-up predictions. It now fetches `/api/track-record` and `/api/backtest` and renders only real on-chain-resolved stakes.
- **Honest even when unflattering** - the sole resolved position so far is a high-conviction BTC call that was wrong; its 0.091 USDC stake was slashed to a burn address (realized P&L -0.091, Brier 0.6724). Each resolved row links to its Arc resolve tx.
- **Never seeded** - with no resolved positions the feed shows an explicit empty state; nothing is backfilled or cherry-picked. `vite build` green; deployed (`f101b7b`).

## MCP registry publish + cronus_pay tool & CLI (2026-07-01)

- **Published to the MCP registry** - `cronus-mcp` (`io.github.Artem1981777/cronus-mcp`) is live in the Model Context Protocol registry, published from `server.json` via a GitHub OIDC workflow; npm bumped to `0.2.0` (`npx cronus-mcp@latest`).
- **New `cronus_pay` tool** - returns the live x402 HTTP 402 quote for a premium signal plus `pay_to`, network, and step-by-step `how_to_pay`, so a wallet or agent can settle USDC on Arc and retry `cronus_signal`. It never moves funds and never fabricates payers: a payment counts as a verified external payer only after on-chain confirmation (`/api/receipts`); self-generated test traffic stays labeled separately.
- **CLI mode** - `cronus-mcp consult|signal|nano-signal|pay [INSTID]` prints one-shot JSON without an MCP client.
- **Landing CTA fix** - the become-a-real-external-payer prompt now points to `npx cronus-mcp pay ETH-USDC` (previously an internal self-demo script), reinforcing that self-generated volume is never counted as external.
- Honest: `external_payers` stays 0 until a real third party pays. Smoke (4 tools) + CLI + build green.

## MCP distribution - cronus-mcp package (2026-07-01)

- **Published Cronus as MCP tools** - new `cronus-mcp` npm package (thin stdio MCP server) exposes three agent tools over the live API: `cronus_consult` (FREE verdict + deterministic reasoning + re-verifiable `traceHash`), `cronus_signal` (x402-paid, 0.02 USDC on Arc; returns the HTTP 402 quote until paid), and `cronus_nano_signal` (Circle Gateway nanopayment, ~0.001 USDC).
- **Registry-ready** - package carries `mcpName: io.github.Artem1981777/cronus-mcp` and ships `server.json` (schema 2025-09-29, npm registryType, stdio transport) for the Model Context Protocol registry.
- **Thin client, no duplicated logic** - every tool proxies the live Cronus HTTP endpoints; override the base with `CRONUS_BASE_URL`. Verified with a live MCP handshake smoke test (listTools + callTool): consult -> 200, signal -> 402.
- Install: `npx cronus-mcp@latest`.

## Traction correction (2026-06-29): external_payers = 0, self-generated test volume

- `/api/traction` and `/api/leaderboard` report on-chain x402 settlement volume from receipts as `self_generated_*` (our own dev-session test traffic); canonical `external_payers` stays 0 until a real third party pays.
- Fields: `external_payers` (= 0, canonical), plus `self_generated_wallets` / `self_generated_txs` / `self_generated_usdc` / `self_generated_leaders`.
- Snapshot: 0 verified external payers; 111 self-generated test settlements totaling 2.22 USDC across 39 of our own wallets, proving the paywall settles real USDC on Arc end-to-end.
- Added `scripts/audit-funders.mjs` to audit the on-chain funding source of any payer wallet.

## Gateway integration hardening (2026-06-29)

- **Honest NANO settlement labeling** — response now exposes `verification: "eip3009-signature"` and `served: "immediate"`; removed misleading "pending on-chain tx" wording; Arc deviation documented in README. (commit 0658e17)
- **True sub-cent streaming ($0.00001/sec)** — was $0.001; demonstrates Circle Gateway's $0.000001 floor.
  Proof: https://cronus-capital.vercel.app/api/stream → usdPerSec 0.00001 (commit d615671).
- **Per-dataset bulk tier ($0.05)** — third usage-based billing model via the same Gateway middleware (`?tier=dataset`).
  Proof: https://cronus-capital.vercel.app/api/nano-signal?tier=dataset → 402 paywall (commit 62dd4a0).
- **Dashboard: three billing models surfaced** — per-call / per-second / per-dataset, one Circle Gateway rail.

### Verified Gateway flow (Arc testnet)
deposit tx 0xb817a39ce9a7b5e108831a356027c1e4ac24dabeafcc09ea1766cd8cef02fa7c → 402 → EIP-3009 signed off-chain → verified & served immediately → Gateway settlement id (e.g. 2b381aa2-bb63-4f9c-b76a-663748c9f332). Batched settlements on Arc testnet return UUID ids and are not individually queryable on arcscan (deviation documented above).

## Nanopayments-round polish (2026-06-28)

- **[task 6] Live ERC-8004 reputation on dashboard** — dashboard reads `getReputation(1)` on-chain (auto-refresh, 15s).
  Proof: `0x2A19ad056EaE83364B0a6420685974cA219c209E` → getReputation(1) = count 2, avg 5.00/5.

- **[task 2] NANO-first UX** — $0.001 NANO is the headline action; $0.02 demoted to PREMIUM tier; live Circle Gateway traction card.
  Proof: https://cronus-capital.vercel.app/api/traction (nano.total_calls, nano_usdc).

- **[task 3] STREAM SIGNALS tier (pay-per-second)** — `/api/stream` + dashboard panel (start/stop, live counter) + `buyer-agent --stream` real per-second Gateway micropayments.
  Proof: 5×$0.001 stream settlements; batch feedback tx `0x44832c8718dd30cdf338966fc32584fc1c5509fb9afee63f6b9975b42c67bd34`.

- **[task 4] One-command external pay + honest leaderboard** — hardened `pay-and-consult.mjs` (budget guard); `/api/leaderboard` returns `unique_external_payers` vs `self_demo_calls`; README "Pay Cronus in 60 seconds".
  Proof: https://cronus-capital.vercel.app/api/leaderboard → unique_external_payers 0, self_demo_calls 16.

- **[task 5] Circle Gateway DX feedback** — `docs/CIRCLE_FEEDBACK.md`.

- **[task 7] Publisher persona (RFB)** — per-signal $0.001 nano-unlock + public on-chain settled-payments feed from `/api/receipts`.
  Proof: https://cronus-capital.vercel.app/api/receipts → 93 receipts, 1.86 USDC.

- **[task 8] Judge-proofing** — README "Verify in 2 minutes" maps every claim to a live endpoint or on-chain tx; all `/api/*` return 200 (paywall 402), never 500.

### Honesty note
Circle Gateway settles 1:1 on Arc testnet (settlement IDs are UUIDs; batching shown as a protocol capability). Self-demo (A2A) volume is never counted as organic external demand.
