# Cronus Capital - Security & Honest Trade-offs

Cronus settles real x402 payments on Arc testnet. This document lists what is
real, what is trusted, and the trade-offs made for the hackathon, with the
upgrade path for each.

## Verified properties

- Real on-chain settlement. Every paid signal is unlocked only after an on-chain
  USDC Transfer to payTo is verified from the tx receipt. No simulated payments
  on the live path.
- Report integrity. Each signal response carries a keccak256 commitment over the
  report, recorded in a hash-chained ledger.
- Money safety in code. Spend limits are enforced by the orchestrator, not the
  model. The LLM proposes values; the code enforces the hard cap, so a
  hallucinated number can never overspend.
- Arc-native reconciliation. Payments can be routed through Arc's Memo contract,
  attaching an indexed, reconcilable reference on-chain.

## Trade-offs (flagged for post-hackathon)

1. RPC trust. Payment verification reads from public Arc RPC endpoints. A
   malicious RPC could return false data. Mitigation: multi-RPC fallback list,
   prefer the official endpoint. Upgrade: cross-check across two or more nodes.
2. Freshness window vs full one-time-use. Payments are accepted within a bounded
   freshness window (default 1800s). A tx could in theory be replayed within that
   window. Mitigation: short window. Upgrade: one-time-use via a KV store keyed
   by txHash.
3. Treasury key. Server-side funded flows use a treasury wallet key held in env.
   If leaked, the treasury balance is drainable. Mitigation: keep minimal funds,
   rotate regularly. No user funds are ever custodied.
4. Upstream data dependency. Signal quality depends on OKX live market data and
   the LLM. If upstream fails, the response degrades. Mitigation: a live flag is
   returned; numbers are never fabricated when data is missing.
5. Demo button. The dashboard has a clearly labeled "UNLOCK SIGNAL (demo)" local
   counter and a separate, real "BUY SIGNAL" x402 button. Only BUY SIGNAL moves
   funds on-chain.

## Scope of the commitment

The keccak256 commitment proves the integrity of the report at settle time. It
does not guarantee the future correctness of the prediction - it makes the
signal tamper-evident, not clairvoyant.
