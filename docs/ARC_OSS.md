# Cronus Capital — Arc OSS primitives

Reusable building blocks for Arc / Circle builders, extracted from Cronus Capital — an autonomous agent that both earns and pays on Circle's Arc testnet.

- Live: https://cronus-capital.vercel.app
- Repo: https://github.com/Artem1981777/CronusCapital
- Chain: Arc testnet (chainId 5042002)

## What you can reuse

### 1. Pay-to-think — an agent that pays upstream for data
- Files: `lib/payToThink.js`, `lib/dataMarket.js`
- Endpoint: `/api/pay-to-think` (GET config + settled COGS; POST preview/execute)
- Gives you: autonomous USDC settlement to upstream data providers as cost-of-goods, with per-tx caps, a daily spend breaker, a KV lock, and protected-recipient rejection (it can never pay its own treasury/payout). Includes net-PnL-after-COGS accounting.

### 2. Honesty / traction separation
- Files: traction + leaderboard logic (`/api/traction`, `/api/leaderboard`)
- Gives you: a clean split between self-generated test traffic and verified external payers (allow-listed; treasury/self excluded). Your own volume is never counted as demand.

### 3. Content-addressed reasoning traces
- Files: `lib/traceArchive.js`; endpoint `/api/trace`
- Gives you: sha256 canonicalize + contentHash + verifyRecord + archive. Re-hashing a stored record reproduces its address, so tampering is detectable.

### 4. x402 + Circle Gateway payment tiers
- Nano / standard / stream tiers; EIP-3009 sub-cent authorizations; a per-second nano-payment stream over Circle Gateway.

### 5. Verifiable scorecard
- Files: `lib/scorecard.js`; endpoint `/api/scorecard`
- 8 independently verifiable claims + a Sourcify-verified contract map.

### 6. Contracts (Foundry-tested, Sourcify-verified)
- ERC-8004 identity, escrow, reputation, and vault contracts on Arc testnet.

## Quickstart
- `git clone https://github.com/Artem1981777/CronusCapital`
- `cd CronusCapital`
- `npm install`
- `npm run build`
- `node --test test/*.test.mjs`

Key env flags (all OFF by default): `PAY_TO_THINK`, `PAY_TO_THINK_LIVE`, `CRONUS_UPSTREAM_SOURCES`, `CRON_SECRET`.

## Honest status
external_payers = 0. Every on-chain settlement so far is self-generated test traffic, explicitly labeled and excluded from demand metrics. We never fake traction.
