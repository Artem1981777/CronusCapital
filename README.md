# 𓂀 Cronus Capital

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

## What's real vs modeled (honesty)

- ✅ **Real on-chain:** every USDC transfer (x402 earn, upstream spend, vault deposit/withdraw, settlement), the hash-chain ledger, and the pre-flight simulation.
- ✅ **Real reasoning:** the CONSULT trace is produced live by a real LLM (Groq Llama 3.3) over real OKX market data (price, 24h change, 24h high/low, volume) via /api/consult - not a scripted animation - and the agent abstains (SKIP) when conviction is below its 65% bar.
- 🧠 **Historical analog = heuristic:** the MEMORY stage is the LLM's qualitative recall of a similar past regime with a similarity score - an estimate, not a backtested dataset.
- 🔐 **Non-custodial by design:** unlike autonomous agents that keep a hot private key on the server to self-sign, Cronus reasons autonomously but every settlement is signed in the user wallet - no agent key sits on the server, ever.
- ⚠️ **Modeled on testnet:** yield magnitudes and EV figures are illustrative — the mechanics, shares, and transactions themselves are real.
- ℹ️ **x402** here is a real USDC transfer to the agent (pay-per-call) — a pragmatic simplification of the full HTTP-402 + facilitator handshake.

---

## Run locally

    npm install
    npm run dev

Connect a wallet on Arc Testnet (chainId 5042002), grab test USDC from the Circle faucet, then try CONSULT → UNLOCK → PAY UPSTREAM → FORCE EXECUTE.

---

**Builder:** Artem Gromov · GitHub @Artem1981777 · ETH gromov7.eth
