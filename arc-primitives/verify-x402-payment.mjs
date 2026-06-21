// verify-x402-payment.mjs - reusable x402 payment verifier for Arc (USDC). MIT.
// Confirm an on-chain USDC Transfer >= minAmount to payTo from a tx hash.
// Zero dependencies: raw JSON-RPC via fetch. Works for plain transfers AND
// memo-wrapped transfers (the inner USDC Transfer is still emitted).
import { fileURLToPath } from "node:url"

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const DEFAULT_USDC = "0x3600000000000000000000000000000000000000"
const DEFAULT_RPC = "https://rpc.testnet.arc.network"

async function rpc(rpcUrl, method, params) {
  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  const j = await r.json()
  if (j.error) throw new Error(method + ": " + JSON.stringify(j.error))
  return j.result
}

const topicToAddress = (t) => "0x" + t.slice(26).toLowerCase()

export async function verifyX402Payment({
  txHash,
  payTo,
  minAmount,
  asset = DEFAULT_USDC,
  rpcUrl = DEFAULT_RPC,
}) {
  const receipt = await rpc(rpcUrl, "eth_getTransactionReceipt", [txHash])
  if (!receipt) return { paid: false, reason: "receipt not found" }
  if (receipt.status !== "0x1") return { paid: false, reason: "tx reverted" }

  const want = BigInt(minAmount)
  const payToLc = payTo.toLowerCase()
  const assetLc = asset.toLowerCase()

  for (const log of receipt.logs || []) {
    if ((log.address || "").toLowerCase() !== assetLc) continue
    if (!log.topics || (log.topics[0] || "").toLowerCase() !== TRANSFER_TOPIC) continue
    if (topicToAddress(log.topics[2]) !== payToLc) continue
    const amount = BigInt(log.data)
    if (amount >= want) {
      return {
        paid: true,
        payer: topicToAddress(log.topics[1]),
        amount: amount.toString(),
        txHash,
        block: receipt.blockNumber,
      }
    }
  }
  return { paid: false, reason: "no matching USDC Transfer to payTo >= minAmount" }
}

// CLI: node verify-x402-payment.mjs <txHash> <payTo> <minAmount>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [txHash, payTo, minAmount] = process.argv.slice(2)
  if (!txHash || !payTo || !minAmount) {
    console.error("usage: node verify-x402-payment.mjs <txHash> <payTo> <minAmount>")
    process.exit(1)
  }
  verifyX402Payment({ txHash, payTo, minAmount })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error(e); process.exit(1) })
}
