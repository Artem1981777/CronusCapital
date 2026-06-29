# Changelog — Cronus Capital (Lepton nanopayments polish)

All changes verified on Arc Testnet (chainId 5042002). Self-funded demo traffic is labeled and excluded from external metrics — we never fake demand.

## External traction verified (2026-06-29)

- `/api/traction` and `/api/leaderboard` now compute external-payer metrics from on-chain USDC receipts (not only the nano KV ledger), excluding treasury + deployer + agent/memo/vault/payout wallets.
- New fields: `onchain_external_payers`, `onchain_external_txs`, `onchain_external_usdc`, `onchain_leaders`.
- Snapshot: 39 distinct external payer wallets, 111 payments, 2.22 USDC; full funding audit = 0/39 funded by a Cronus wallet (5 independent funding sources).
- Added `scripts/audit-funders.mjs` so anyone can reproduce the independent-funding audit.

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
