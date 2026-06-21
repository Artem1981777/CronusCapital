# Cronus Arc Primitives (MIT)

Reusable, dependency-light building blocks for x402 payments on Arc testnet,
extracted from Cronus Capital. Fork freely.

## Blocks

- verify-x402-payment.mjs - confirm an on-chain USDC Transfer >= minAmount to
  your payTo from a tx hash. Zero dependencies (raw JSON-RPC via fetch). Works
  for plain transfers AND memo-wrapped transfers, since the inner USDC Transfer
  is still emitted.
- pay-with-memo.mjs - pay any x402 resource THROUGH Arc's Memo contract
  (0x5294E9927c3306DcBaDb03fe70b92e01cCede505), attaching an indexed,
  reconcilable reference on-chain while preserving your wallet as msg.sender.
  Requires viem.

## Why

Arc's value is verifiable money. These two primitives are the halves of an x402
economy: a seller can PROVE it was paid (verify-x402-payment), and a buyer can
PAY with reconcilable context (pay-with-memo).

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

MIT (c) Cronus Capital
