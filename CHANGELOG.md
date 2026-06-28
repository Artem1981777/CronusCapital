# Changelog — Cronus Capital (Lepton nanopayments polish)

All changes verified on Arc Testnet (chainId 5042002). Self-funded demo traffic is labeled and excluded from external metrics — we never fake demand.

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
