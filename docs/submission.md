# Cronus Capital — Submission (Canteen × Circle · Arc testnet)

## Links
- Live demo: https://cronus-capital.vercel.app
- Repo: https://github.com/Artem1981777/CronusCapital
- Video (<=3 min): https://youtube.com/shorts/g2ZMK0a3uZM
- Explorer: https://testnet.arcscan.app
- Network: Arc Testnet · chainId 5042002 · USDC as native gas · USDC ERC-20 0x3600...0000 (6 dec)

## One-liner
An autonomous oracle agent that **earns** on Arc: it sells trading signals per call, pays for its own upstream data, settles in USDC, and reports its P&L on-chain — now with a sub-cent **NANO tier settled gas-free via Circle Gateway** and consumed by an autonomous A2A buyer-agent, with strictly honest, self-labeled traction.

## Round fit — Circle Gateway nanopayments
- NANO tier: $0.001/call, gas-free via Circle Gateway (EIP-3009 signed authorizations), USDC on Arc.
- Autonomous buyer-agent (`scripts/buyer-agent.mjs`): discover (`/api/manifest`) -> budget -> pay gas-free -> consume signal.
- Endpoints: `/api/nano-signal` (402 + Gateway), `/api/traction` (live nano metrics), `/api/leaderboard` (external A2A payers).

## Traction (honest, verifiable)
STANDARD x402 (on-chain):
- 90+ real USDC payments on Arc testnet, read live from the explorer via `/api/metrics` (value-filtered to the $0.02 price).
- Public receipts: `/api/receipts` (JSON; `?format=csv`).

NANO (Circle Gateway):
- 10 gas-free nano-payments settled via Circle Gateway; nano volume ~$0.01.
- `unique_external_payers = 0` (no third-party demand yet) — leaderboard intentionally empty.
- `self_demo_calls = 10`: the buyer-agent is self-funded and registered in `SELF_DEMO_ADDRESSES`, so its traffic is labeled autonomous self-demo, NEVER counted as external revenue.

Honesty notes (the project's edge):
- On Arc testnet, Circle Gateway settles **1:1** (each call -> its own settlement id). N->1 batching is shown as a Circle Gateway **protocol capability at scale**, not claimed as achieved here.
- Gateway settlement identifiers are labeled `gateway-batch` with on-chain tx **pending**; arcscan `/tx/` links render only for real `0x` on-chain hashes.
- All on-chain volume to date is self-generated to prove the rails — not external customer revenue, and none is mocked or hardcoded.

## On-chain references
- ERC-8004 Identity Registry: 0x252cAA46b9b0648908000f6C87e0a561DB4dEb6c (agentId 1 = 0x46213abeca58cc9a89a269fd25a8737c700ca164)
- ERC-8183 Job Escrow: 0x64e55De4CbC3CDf981B2c970807129FA61806873
- Treasury / payTo: 0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd
- Circle GatewayWallet (deposit target): 0x0077777d7eba4688bdef3e311b846f25870a19b9
- Buyer-agent Gateway deposit tx: 0xb817a39ce9a7b5e108831a356027c1e4ac24dabeafcc09ea1766cd8cef02fa7c
- Example NANO settlement ids (Circle Gateway): c0b5e848-1f78-4b02-a0a1-79e465f7aa4e, 3e2f5652-a667-4a2b-874a-da12a3935546

## Tech
- SDK: @circle-fin/x402-batching@3.2.0 (Gateway client + server middleware), viem.
- Vercel serverless (10 functions), Upstash KV for nano ledger/traction.
- CI: GitHub Actions — tests (75 pass) + build gate green; lint informational.

## Demo
See `docs/demo-script.md` (3-minute judge walkthrough).

## Scope / planned
- Trust stack: ERC-8004 identity + ERC-8183 escrow live on-chain; a dedicated on-chain reputation-feedback contract (CronusReputation) is a planned stretch.
