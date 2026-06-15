# Cronus Capital — Agent Skill Manifest

> Autonomous market-intelligence oracle that researches prediction markets, scores
> expected value, and settles verifiable decisions on-chain — built for the Arc agent economy.

- **id:** `cronus-capital`
- **version:** `0.7.2`
- **author:** `gromov7.eth` (@Artem1981777)
- **network:** Arc Testnet · chainId `5042002`
- **settlement asset:** USDC (`0x3600000000000000000000000000000000000000`, 6 decimals)
- **standards:** ERC-8004 (agent identity / registries) · ERC-8183 (job escrow) · x402 (pay-per-call)
- **live:** https://cronus-capital.vercel.app · repo https://github.com/Artem1981777/CronusCapital

## What it does
Cronus runs three cooperating oracle agents over a market topic and returns a
settled, auditable decision:

1. **SCOUT — Market Intelligence.** Pulls candidate markets + signals (Polymarket, Arc oracle feed), filters by corroboration.
2. **ANALYST — Expected-Value Engine.** Computes EV and Kelly-sized conviction; gates on an edge threshold.
3. **EXECUTOR — Autonomous Decision Layer.** Applies policy guardrails, then settles a real USDC transaction on Arc and writes a keccak job hash to a tamper-evident ledger.

## Interface
- **input:** `{ topic: string }` — a market question (e.g. "BTC > $80k by Jun 30").
- **output:** `{ decision, conviction (0–1), evidence[], txHash, jobHash, reasoningTraceHash }`.
- **trigger:** UI `CONSULT` / `FORCE EXECUTE`, or programmatic call.

## Tools / capabilities
- `scan_markets` — fetch + dedupe market signals.
- `score_ev` — expected value + Kelly fraction + confidence ring.
- `settle_onchain` — non-custodial USDC settlement via connected wallet on Arc.
- `commit_reasoning` — keccak256 content-commitment of the chain-of-thought.
- `verify_ledger` — recompute the hash-chain and report integrity.

## Guardrails (7/7 SecOps, enforced)
- Non-custodial: agent signs via connected wallet, no keys stored.
- Allowlisted settlement target only.
- Per-tx spend cap: **0.01 USDC**.
- Daily circuit breaker: **5.00 USDC/day**, auto-halt.
- Replay / double-spend guard (keccak jobHash dedupe).
- Tamper-evident audit ledger (hash-chained decisions).
- Feed prompt-injection guard (sanitized + source-allowlisted before the LLM).

## Verifiability
- **Settlement ledger:** every decision is hash-chained (`jobHash = keccak256(canonical || prevHash)`); any edit breaks the chain.
- **Reasoning trace:** each consult's CoT is canonicalized and keccak-committed (content-addressed, IPFS-CID parity, anchor-ready); auditors recompute and detect tampering.
- **Track record:** self-scored hit-rate + Brier + calibration over logged calls — no cherry-picking.

## Economics
- Revenue via **x402** pay-per-call (~$0.02/call); settlement cost ~$0.01/tx → net-positive unit economics surfaced live (net flow KPI).

## Explorer
- RPC: `https://rpc.testnet.arc.network` · Explorer: `https://testnet.arcscan.app` · Faucet: `https://faucet.circle.com`
