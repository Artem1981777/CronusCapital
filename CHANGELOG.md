# Changelog — Cronus Capital (Lepton nanopayments polish)

All changes verified on Arc Testnet (chainId 5042002). Self-funded demo traffic is labeled and excluded from external metrics — we never fake demand.

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
