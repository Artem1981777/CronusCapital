# Cronus Arc Primitives (MIT)

Reusable, dependency-light building blocks for x402 payments and honest agent
money on Arc testnet, extracted from Cronus Capital. Fork freely.

## Blocks

- **verify-x402-payment.mjs** - confirm an on-chain USDC Transfer >= minAmount to
  your payTo from a tx hash. Zero dependencies (raw JSON-RPC via fetch). Works
  for plain transfers AND memo-wrapped transfers, since the inner USDC Transfer
  is still emitted.
- **pay-with-memo.mjs** - pay any x402 resource THROUGH Arc's Memo contract
  (0x5294E9927c3306DcBaDb03fe70b92e01cCede505), attaching an indexed,
  reconcilable reference on-chain while preserving your wallet as msg.sender.
  Requires viem.
- **spend-breaker.mjs** - a pure, deterministic spend cap / circuit breaker for
  USDC outflows. Money safety lives in code, not in a model: given amount
  already spent, the requested amount, and a hard cap (atomic units), it decides
  allow/deny and the remaining budget. Zero dependencies; ships a built-in
  `selftest`.
- **price-crosscheck.mjs** - corroborate a primary market price against an
  independent public spot (Coinbase) and report the spread + whether they agree
  within a tolerance band. Advisory and fail-open: it never fabricates a price.
  Zero dependencies.

## Why

Arc's value is verifiable money. These primitives are the pieces of an honest
x402 economy: a seller can PROVE it was paid (verify-x402-payment), a buyer can
PAY with reconcilable context (pay-with-memo), an agent can CAP its own spend so
a hallucinated number never overspends (spend-breaker), and a signal can be
CROSS-CHECKED against a second venue before it is trusted (price-crosscheck).

## Money safety

Spend limits are enforced in code, not by the model. An LLM may propose a value,
but the caller enforces the hard cap - a hallucinated number can never overspend.

## Use

Verify a payment (CLI):

    node verify-x402-payment.mjs 0xTX 0xPAYTO 20000

Verify a payment (import):

    import { verifyX402Payment } from "./verify-x402-payment.mjs"
    const res = await verifyX402Payment({ txHash, payTo, minAmount: "20000" })

Pay with a memo:

    BUYER_PRIVATE_KEY=0x... node pay-with-memo.mjs "your reference topic"

Enforce a spend cap (import + CLI):

    import { decideSpend, createBreaker } from "./spend-breaker.mjs"
    decideSpend({ spentAtomic: "0", amountAtomic: "20000", capAtomic: "1000000" })
    node spend-breaker.mjs selftest

Cross-check a price against a 2nd source:

    import { crossCheck } from "./price-crosscheck.mjs"
    const c = await crossCheck("BTC-USDC", 65000)
    node price-crosscheck.mjs BTC-USDC 65000 1

MIT (c) Cronus Capital
