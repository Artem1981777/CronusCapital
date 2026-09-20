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
## 10. Mainnet governance migration is a re-deployment, not a transfer
The first Arc Mainnet deployment left `owner`, `operator`, `guardian` and `recovery` of `CronusAgentGuardV2` on the deployer key, and `/api/governance` has published that as three failing invariants ever since. Two of them cannot be repaired in place: `recovery` is `immutable`, and `CronusDrillCertificate` binds `operator`, `guardian`, `holder` and `guard` immutably as well. `extTransferOwnership` through the 24h timelock would therefore fix one invariant and leave the cold exit sink pointing at the same hot key that the guard exists to contain.

So `scripts/deploy-governance-mainnet.mjs` deploys `CronusMultisig` and re-deploys the three role-bound contracts (guard, drill certificate, access pass) with the roles separated from birth, then asserts the invariants back off the chain before the addresses are published. The cost of the choice is new addresses and a break in the deployed-contract history; the reason it is cheap here is that it was checked rather than assumed — on Mainnet the superseded guard, vault, pass and swap all hold 0 USDC and the pass has 0 holders, so no user state exists to strand. The script refuses to run if that stops being true.

`CronusVault.owner` and `CronusSwap.owner` stay with the deployer and are *not* migrated: the vault owner's only power is `addYield` (it can add funds, never remove them) and the swap owner's is `pause` plus `removeLiquidity` of liquidity it supplied itself. Both are documented as such rather than quietly counted as governed.
