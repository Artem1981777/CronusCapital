# Cronus Capital — Traction (honest, self-verifiable)

**TL;DR: verified external payers = 0.** Every on-chain x402 / Circle Gateway settlement so far is self-generated test traffic, produced by us across dev sessions to prove the paywall settles real USDC on Arc end-to-end. We never count our own test volume as external demand.

Cronus's edge is honesty: we separate *self-generated* volume from *external* demand at the data layer, label it explicitly in the API, and surface it that way on the landing page. Comparable projects often report a single blended "payments" number; we refuse to.

## Definitions

- **self** — our treasury (`0xdc67…fbd`), the deployer / buyer-agent, and six infra contracts (vault, memo, payout treasury, staking identity, x402 agent). Enumerated in `lib/traction.js` `selfAddresses()`, extendable via `SELF_DEMO_ADDRESSES`.
- **self-generated** — on-chain receipt payers that are *ours* (dev-session wallets). Real USDC, real settlements — but NOT customers.
- **external** — an on-chain payer that is BOTH (a) not self AND (b) explicitly allow-listed in `VERIFIED_EXTERNAL_PAYERS`. Only these count toward `external_payers` (see `verifiedExternal()`).

## Live snapshot (2026-07-01T17:36Z)

| Metric | Value |
| --- | --- |
| Verified external payers | **0** |
| External USDC | 0 |
| On-chain x402 settlements (all, self-generated) | 114 |
| Distinct self-generated dev wallets | 40 |
| Total on-chain settled USDC | 2.28 |
| Nano (Gateway) calls | 17 |
| Nano USDC | 0.017 |

Of the 2.28 USDC across 114 settlements, ~1.42 USDC came from 40 distinct non-infra dev wallets and the remainder from our own infra addresses. All of it is self-generated; none is external demand.

## Verify it yourself

- Live JSON: https://cronus-capital.vercel.app/api/traction
- On-chain receipts (every settlement, tx hashes): https://cronus-capital.vercel.app/api/receipts
- Per-wallet leaderboard: https://cronus-capital.vercel.app/api/leaderboard
- Every tx is independently viewable on the Arc testnet explorer: https://testnet.arcscan.app

## How a real external payer shows up

When a third party pays — via the on-chain PAY button, `npx cronus-mcp pay ETH-USDC`, or the `cronus_pay` MCP tool — and their address is added to the `VERIFIED_EXTERNAL_PAYERS` allow-list, `external_payers` increments and the landing "VERIFIED EXTERNAL DEMAND" panel turns green. Until then it stays honestly at 0.
