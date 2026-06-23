# 𓂀 Cronus Capital

> **Ask Cronus: _"Should I buy BTC right now?"_** The agent scouts live market data, pays for it on-chain via x402, runs an EV check, and returns a verifiable **BUY / SKIP** verdict - every paid call settled in real USDC on Arc, with an on-chain receipt.

**The first AI agent that runs a real business on Arc — it earns, spends, settles, and reports its own P&L on-chain.**

Cronus is an autonomous prediction-market oracle agent. It scans markets, scores expected value with three oracles, and executes settlements in native USDC on Arc. Unlike agents that only *spend*, Cronus **charges for its work and closes the loop net-positive**, with a verifiable trace of every decision.

- **Live demo:** https://cronus-capital.vercel.app
- **Repo:** https://github.com/Artem1981777/CronusCapital
- **Explorer:** https://testnet.arcscan.app
- **Network:** Arc Testnet · chainId 5042002 · native USDC 0x3600...0000 (6 decimals)

---

## Why it matters — RFB 02 (Monetize an API / agent)

Most "agent economy" demos show an agent *paying* for things. Cronus is the other half of the economy: an agent that **gets paid per call, covers its own costs, and earns a positive margin on every paid call** — fully on-chain and auditable.

> Other agents learn to honestly **spend**. Cronus is the agent that **earns**, pays, settles on-chain, and balances its P&L. It is an engine for the agent economy on Arc.

---

## The money loop (all real on-chain)

| Step | Action | On-chain |
|---|---|---|
| **Earn** | Client presses **UNLOCK SIGNAL · \$0.02 (x402)** | real USDC transfer to agent contract 0xd81a420…880f |
| **Pay** | Agent buys upstream data — **PAY UPSTREAM · \$0.005** | real USDC transfer out |
| **Net** | Net Flow = revenue − spend, shown live (green when > 0) | derived from booked tx |
| **Settle** | Decision written to the Verifiable Ledger (keccak hash-chain) | per-action label, Verified badge + tx link |

Demo frame: UNLOCK **+\$0.02** → PAY UPSTREAM **−\$0.005** → **Net Flow +\$0.015**, both with a "view tx" link on arcscan.

---

## Dashboard guide (what you are looking at)

The live demo (https://cronus-capital.vercel.app) is a single screen. Here is every panel, top to bottom.

**Header**
- **Title - CRONUS ORACLE DASHBOARD.** The agent's control room.
- **Wallet chip (top-right, e.g. `0xDC...7FBD`).** The connected wallet / agent treasury address. Click to connect or switch wallets.
- **Traction badge (`N x402 payments . X USDC settled on Arc . last tx`).** Live count of real on-chain x402 payments, read from `/api/metrics`; "last tx" links to the latest settlement on the Arc explorer.
- **Version badge (`v0.7.2 . MEMO + BATCHED PAYMENTS`).** Marks Arc transaction-memo support.

**Metric cards (top row) - all derived from real on-chain activity**
- **USDC SETTLED** - total USDC moved through the agent's verified settlements.
- **REVENUE (X402)** - income earned from paid signal calls.
- **PAID CALLS** - number of x402 paid calls served.
- **AGENT SPEND** - what the agent paid upstream for data.
- **NET FLOW** - revenue minus spend (green when positive); the agent's live margin.

**Metric cards (second row)**
- **DATA ROI** - USDC earned per 1 USDC of data spend (e.g. 1.6x); proves the loop is net-positive.
- **CONFIDENCE SCORE** - the agent's calibrated confidence (0-100) over its active signals.

**Agent pipeline (left) - the three oracles, with live status**
- **SCOUT - Signal Discovery.** Pulls live market data.
- **ANALYST - Risk & Conviction.** Scores expected value and conviction.
- **EXECUTOR - On-chain Settlement.** Signs and settles the USDC transaction.

**Market Intelligence (center)** - a live radar of the signals the Scout is tracking.

**Oracle Actions (right) - the buttons you press**
- **CONSULT ORACLES (free).** Runs the real LLM reasoning trace over live OKX data and prints the decision log plus a consensus verdict. No payment - start here to see how the agent thinks.
- **FORCE EXECUTE.** Manually triggers an on-chain settlement of the current decision (demo control).
- **BUY SIGNAL - 0.02 USDC (real x402).** The headline action: pays 0.02 USDC on-chain through Arc's Memo contract, verifies the payment server-side, then unlocks a verifiable signal - showing the verdict, conviction, a keccak `commitment`, the live **agent decision log** (`trace`), and a link to the payment tx. This is real money moving.
- **UNLOCK SIGNAL (demo) - 0.02 USDC (x402).** The same flow on a no-cost demo path for quick walkthroughs.
- **PAY UPSTREAM - 0.005 USDC (agent buys data).** The agent spends its own USDC on upstream data - the cost side of the loop.
- **DEPOSIT / WITHDRAW (bottom).** Move USDC in and out of the ERC-4626-style vault; your position and Vault TVL are shown below.
- Every paid action prints a **VIEW TX** link to the Arc explorer.

---

## How to use it (step-by-step for judges)

1. **Open the demo** - https://cronus-capital.vercel.app
2. **Connect your wallet** (top-right chip) and approve switching to **Arc Testnet** (chainId 5042002). Grab test USDC from the Circle faucet if needed.
3. **Press CONSULT ORACLES (free).** Watch the agent pull live BTC data and reason step by step (SCOUT -> DECOMPOSE -> DISCOVER -> DECIDE -> SUFFICIENCY -> MEMORY -> CONSENSUS). It may return **SKIP** - it abstains when expected value is below its bar, by design.
4. **Press BUY SIGNAL - 0.02 USDC (real x402).** Confirm the transaction in your wallet. The agent verifies the on-chain payment, then unlocks the signal with its verdict, conviction, `commitment`, and live **agent decision log**. Click **VIEW TX** to see the real settlement (with a `Memo` event) on the Arc explorer.
5. **Press PAY UPSTREAM - 0.005 USDC** to see the cost side: the agent spends on data. Watch **NET FLOW** stay positive.
6. **Verify everything yourself:**
   - Public receipts: https://cronus-capital.vercel.app/api/receipts (add `?format=csv` to export)
   - Live metrics: https://cronus-capital.vercel.app/api/metrics
   - Machine discovery: https://cronus-capital.vercel.app/api/manifest and `/api/openapi`
   - Pay from outside the browser: `scripts/pay-and-consult.mjs` or `scripts/pay-with-memo.mjs`
7. **(Optional) Deposit into the vault** to see ERC-4626 share accounting, then withdraw.

The whole loop in one screen: **reason -> earn (x402) -> spend (upstream) -> settle -> report**, all real on Arc and all verifiable in a browser tab.

---

## How it works — 3 oracles

1. **Scout** — scans prediction markets, gathers signals.
2. **Analyst** — scores EV / conviction, calibrates against track record (Brier score).
3. **Executor** — settles on-chain (USDC transfer) with a pre-flight eth_call simulation and a keccak jobHash.

### Live reasoning trace (real LLM on real data)

Pressing **CONSULT ORACLES** calls the agent's own serverless endpoint `/api/consult`, which (1) pulls **real live market data** from the OKX public ticker (last price, 24h change %, 24h high/low, 24h volume) and (2) asks a **real LLM** (Groq, Llama 3.3 70B) to reason over those numbers and return a structured decision plus a **historical-analog recall**. The output streams into the dashboard line by line - there is no `setTimeout` script (open DevTools, Network tab, `/api/consult` to verify). Every figure in the trace is a fact we fed in or derived from it; the model is barred from inventing indicators (no RSI/EMA/SMA, no fabricated volume). A real run:

    SCOUT: 0.31% 24h change, price 63070.6
    DECOMPOSE: 24h range 62275.1-63359.9, current price 76.5% from low
    DISCOVER: distance to high 289.3, distance to low 795.5
    DECIDE: +0.31% 24h clears +0.20% trigger -> long bias, EV 0.58 vs 0.50 hurdle
    SUFFICIENCY: 24h volume 37.27, sufficient liquidity
    EXECUTOR: long entry 63070.6, stop 62275.1, target 63359.9
    MEMORY: nearest regime Bull -> continued upward (similarity 0.70)
    CONSENSUS: SKIP - conviction 58% (below 65 bar)

Note the verdict: **SKIP at 58% conviction**. Cronus abstains when its own confidence bar is not met - it is not a YES-machine. That discipline, plus the MEMORY analog stage, is what a pay-per-query data vendor (e.g. QMA) lacks: Cronus does not just sell a report - it reasons, decides, abstains, and runs the full on-chain economic loop.

---

## On-chain vault (ERC-4626-style)

A real vault on Arc Testnet: the user signs deposit/withdraw; yield (addYield) accrues into the share price (convertToAssets) — no faucet drip into balances.

- **Vault:** 0x13B6984357e27dAB17DF44a6396042239e70542C
- deposit / withdrawAll / addYield — all transactions visible on the address page.

---

## Verifiable & safe

- **Verifiable Ledger** — keccak256 hash-chain of decisions; **each action is labeled correctly** (x402 revenue / upstream spend / settlement / vault), with a Verified status.
- **Reasoning Trace** — content-commitment of the reasoning chain (keccak256), REPRODUCIBLE badge.
- **Track Record** — forecast history with hit-rate and Brier score.
- **SecOps** — per-tx cap 0.01, daily cap 5.0, recipient allowlist, pre-flight eth_call abort-on-revert.

---

## Standards & composability

| Standard | Role | Status |
|---|---|---|
| ERC-8183 | Job escrow settlement (keccak jobHash) | LIVE |
| x402 | Pay-per-call (~\$0.02 / consult) | LIVE |
| CCTP | Native USDC, domain 7 | LIVE |
| ERC-4626 | On-chain vault, share accounting | LIVE |
| ERC-8004 | Agent registries (identity / reputation / validation) | READY |

---

## Why Cronus is different

Most projects in this space ship **infrastructure** - a wallet, a policy engine, a lending pool, a prediction-market venue. Each is one piece of an agent economy. Cronus ships the thing that proves the infrastructure is worth building: **a complete, honest, self-sustaining business that already earns, spends, abstains, and settles on-chain - without ever holding your key.**

- **It runs the whole loop, not one primitive.** Earn via x402 -> spend on upstream data -> report net P&L -> compound into the vault. Most agents do one of these; Cronus does all of them, end to end.
- **It is non-custodial by construction.** Every settlement is signed in your own wallet - there is no server-side key to misuse. Spend caps, a recipient allowlist, and a pre-flight simulation are enforced on top. A guarantee built on a key the agent never holds is stronger than any policy engine.
- **Its reasoning is real and honest.** The CONSULT trace is produced live by a real LLM over real OKX market data, and the agent abstains (SKIP) when conviction is below its bar - no scripted animation, no fabricated indicators, no always-YES.
- **Everything is verifiable in a browser tab.** Live on-chain settlements, a keccak hash-chain ledger of decisions, and the pre-flight simulation are all open to inspection - no trust required.

**The thesis:** most builders are shipping *parts* of an agent economy. Cronus is a *working agent economy*, end to end, that you can audit yourself.

---

## Why Arc, not any other L1

Cronus is not "deployed on a testnet" - it depends on properties only Arc gives an autonomous economic agent:

| Arc property | Why Cronus needs exactly this |
|---|---|
| **USDC is the native gas token** | The agent earns, spends, and pays fees in one asset - no volatile gas token to hold or top up, and net P&L is denominated in the same dollar it transacts in. |
| **Sub-second finality** | Earn -> spend -> settle is a tight loop; a consult that resolves and a settlement that confirms in under a second are what make a live, in-browser demo of a full economic cycle possible. |
| **Built-in stablecoin / FX engine** | Upstream costs and payouts settle in stable value without bridging out, so the agent's books stay clean and auditable. |
| **x402-native payments** | Pay-per-call monetization (UNLOCK 0.02 / upstream 0.005) is a first-class primitive, not a bolted-on hack - the business model is the protocol itself. |
| **Opt-in privacy** | Strategy-level reasoning can stay private while settlements stay publicly verifiable - the agent proves it paid without leaking how it decides. |

Take away USDC-as-gas or native x402 and Cronus stops being a self-contained business. That is the difference between *deployed on Arc* and *only possible on Arc*.

---

## Unit economics & treasury solvency

Cronus is built to be self-sustaining, not subsidized. Each signal it sells through the x402 paywall earns more than the data it buys to produce that signal costs:

- **Revenue** — 0.02 USDC per paid call (x402, settled on-chain)
- **Data cost** — 0.005 USDC per upstream fetch (paid on-chain)
- **Data ROI** — revenue per $1 spent on data, shown live on the dashboard

The dashboard surfaces this in real time: Revenue (x402), Agent Spend, Net Flow, and Data ROI all update from the same on-chain activity. The agent only acts while the loop stays net-positive, capped per transaction and per day by its on-chain guardrails.

**Why this is sustainable, not a pyramid.** Margin is positive on *every external paid call* — 0.02 USDC in vs 0.005 USDC upstream cost, a ~4× markup. The treasury never depends on new investors or token buyers: there is no token, and no one is asked to "buy in" to fund payouts. Spend can never exceed revenue-bearing activity because every outflow is bounded by an on-chain per-transaction cap (0.01 USDC), a daily circuit breaker (5.00 USDC/day), and a conviction gate that only releases spend on positive-EV decisions.

**Honest scope.** Sustained profit requires real external demand for the agent's calls. On Arc testnet these figures are demo/modeled volume — they prove the *mechanism* is net-positive per call, not that the agent is already a profitable production business. The path to real solvency is more external x402 payers (and ecosystem grants such as the Arc Builders Fund), never raising money from new buyers to backfill the treasury.

## Mainnet funding model

Who funds the treasury in production, in order of priority:

1. **Paying customers (primary).** Other agents, trading systems, and apps pay per call over x402. At a ~4× gross margin per call (0.02 USDC in vs 0.005 USDC cost), revenue covers inference, data, infra, and gas at volume. The treasury grows from operations, not from new entrants.
2. **Runway capital (one-time).** Ecosystem grants such as the Arc Builders Fund, plus the founder's own USDC, cover gas and data before revenue scales. Gas on Arc is USDC-denominated and sub-cent, so bootstrap cost is small.
3. **LP vault (optional, capital-efficient).** LPs can deposit USDC as working capital and receive a share of the agent's *realized* on-chain profit — fully transparent and withdrawable. Returns are paid only from real P&L, never from new deposits.

There is no token sale and no "buy-in" to backfill the treasury. Sustained solvency depends on real external demand, which we do not fake; on testnet these volumes are modeled.

## Verifiable x402 paywall (anyone can pay Cronus)

Cronus exposes a real, on-chain-verified paywall at `GET /api/signal` — no demo bypass. Any external agent or wallet can pay and consume:

1. `GET /api/signal?topic=...` returns HTTP `402 Payment Required` with the price (0.02 USDC), asset, and `payTo` address.
2. The caller pays USDC on Arc, then retries with header `X-PAYMENT: <txHash>`.
3. The server verifies the payment **on-chain via JSON-RPC** (USDC transfer of the required amount to `payTo`, tx success, within a freshness window) and only then returns a signed signal plus a keccak256 `commitment` of the response.

**Proof — a real, independent wallet paid and consumed (Arc testnet):**

- Payer (external wallet): `0x46213abeca58cc9a89a269fd25a8737c700ca164`
- Payment: 0.02 USDC to `0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd`
- On-chain tx: https://testnet.arcscan.app/tx/0xfe2764b2b837365ea7cb896fbbe55119ffbf250e51941945bf013a88bb942086
- Response commitment: `0x993453223b57849b38df20ff050daa54905d53a3ac70c56c8e5460eb6fa77611`

This closes the loop honestly: revenue can be **real external demand, verified on-chain** — not the agent paying itself. Reproduce with `scripts/pay-and-consult.mjs` (set `BUYER_PRIVATE_KEY` to any funded wallet).

> Replay protection: payments are accepted only within a freshness window (`SIGNAL_MAX_AGE_SECONDS`, default 1800s). Strict one-time-use can be added with a KV store.

**Two ways to consume the paywall:**

- **From any wallet or agent (CLI):** run `scripts/pay-and-consult.mjs` with a funded `BUYER_PRIVATE_KEY`. Proven with an independent external wallet (tx above).
- **From the dashboard (one click):** the **BUY SIGNAL** button runs the full x402 flow in-browser - request `402`, pay 0.02 USDC on Arc, verify on-chain, then render the verdict, the keccak `commitment`, and a link to the payment tx. No setup, no demo bypass.

**Agent discovery (machine-readable):** point any AI agent at the manifest or OpenAPI spec to auto-discover price, network, `payTo`, and the pay-then-retry flow:

- Service manifest: `GET /api/manifest`
- OpenAPI 3.0 / swagger.json: `GET /api/openapi`
- Every `402` response also embeds a `discovery` block linking both.

**Arc-native reconciliation (transaction memos):** payments can be sent through Arc's `Memo` contract (`0x5294E9927c3306DcBaDb03fe70b92e01cCede505`), which wraps the USDC transfer and emits an indexed `Memo` event while preserving the payer as `msg.sender`. This attaches a reconcilable reference (for example `cronus|signal|<topic>|<ts>`) to each payment on-chain - matching Arc's invoice/payout reconciliation use case - with zero change to our paywall, since the wrapped transfer still emits the USDC `Transfer` our verifier checks. Try it: `scripts/pay-with-memo.mjs "<topic>"`.

> Proof: tx `0xa7a0e3b25394d2c0570be62605f0a379b1a0e5d1ba2e7607f719fbd1ca9943d5` carried memoId `0x30c32e7e09b43cee3059b3d8136b591fda8c61d7840cff45911c60ee04e19d46` and unlocked a verified signal (commitment `0xc9acbd88b845a248e3ee669cca257f2e64f8c1daf17f64063d7765bfeae60680`).

## Public on-chain receipts

**Arc-native receipts - no registry contract needed.** Every paid call emits an on-chain `Memo` event that doubles as a receipt. Browse all settled x402 payments at [`/api/receipts`](https://cronus-capital.vercel.app/api/receipts) (JSON) or export [`/api/receipts?format=csv`](https://cronus-capital.vercel.app/api/receipts?format=csv). Each receipt links txHash, payer, amount, block, commitment and memoId to the Arc explorer.

## What's real vs modeled (honesty)

- ✅ **Real on-chain:** every USDC transfer (x402 earn, upstream spend, vault deposit/withdraw, settlement), the hash-chain ledger, and the pre-flight simulation.
- ✅ **Real reasoning:** the CONSULT trace is produced live by a real LLM (Groq Llama 3.3) over real OKX market data (price, 24h change, 24h high/low, volume) via /api/consult - not a scripted animation - and the agent abstains (SKIP) when conviction is below its 65% bar.
- 🧠 **Historical analog = heuristic:** the MEMORY stage is the LLM's qualitative recall of a similar past regime with a similarity score - an estimate, not a backtested dataset.
- 🔐 **Non-custodial by design:** unlike autonomous agents that keep a hot private key on the server to self-sign, Cronus reasons autonomously but every settlement is signed in the user wallet - no agent key sits on the server, ever.
- ⚠️ **Modeled on testnet:** yield magnitudes and EV figures are illustrative — the mechanics, shares, and transactions themselves are real.
- ℹ️ **x402** here is a real USDC transfer to the agent (pay-per-call) — a pragmatic simplification of the full HTTP-402 + facilitator handshake.

---

## What's new (build log)

Latest hardening, newest first:

- **Public on-chain receipts** - `/api/receipts` (JSON + CSV) lists every settled x402 payment with payer, amount, block, `commitment`, and `memoId`. (`46c6ada`)
- **Receipts in agent discovery** - the `402` challenge now advertises `/api/receipts` alongside the manifest and OpenAPI spec. (`d1e514c`)
- **BUY SIGNAL via Arc Memo** - the in-browser paid call routes through Arc's `Memo` contract, attaching a reconcilable on-chain reference; backend verification is unchanged. (`89cd5b9`)
- **Live traction badge** - the header badge reads real settlement counts from `/api/metrics`. (`997272d`)
- **Live metrics endpoint** - `/api/metrics` reports on-chain x402 traction (payments and USDC settled).
- **Visible agent decision log** - the reasoning `trace` (SCOUT ... EXECUTOR) renders live inside the BUY SIGNAL result. (`e81ce2c`)
- **Forkable OSS primitives (MIT)** - `arc-primitives/`: a zero-dependency x402 payment verifier (which independently confirmed our own memo payment) plus a pay-with-memo helper. (`8c2c28c`)
- **Security and honest trade-offs** - `docs/security-threat-model.md` lists verified properties and flagged limitations.

---

## Run locally

    npm install
    npm run dev

Connect a wallet on Arc Testnet (chainId 5042002), grab test USDC from the Circle faucet, then try CONSULT → UNLOCK → PAY UPSTREAM → FORCE EXECUTE.

---

**Builder:** Artem Gromov · GitHub @Artem1981777 · ETH gromov7.eth
