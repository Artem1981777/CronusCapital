// api/signal.js — REAL x402 paywall: pay USDC on Arc, verified on-chain, returns a verifiable signal.
// Any external agent/wallet can pay and consume. No facilitator dependency; verification is pure JSON-RPC.
import { keccak256, toBytes } from "viem"

const X402_VERSION = 1
const NETWORK    = process.env.X402_NETWORK     || "arc-testnet"
const USDC_ASSET = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase()
const PAY_TO     = (process.env.CRONUS_PAYTO     || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd").toLowerCase()
const PRICE      = BigInt(process.env.SIGNAL_PRICE || "20000") // 0.02 USDC (6 decimals)
const RPC_URL    = process.env.VITE_RPC_URL || process.env.RPC_URL || "https://rpc.testnet.arc.network"
const MAX_AGE_SEC = Number(process.env.SIGNAL_MAX_AGE_SECONDS || "1800")
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

function requirements(resource) {
  return {
    x402Version: X402_VERSION,
    accepts: [{
      scheme: "exact", network: NETWORK, maxAmountRequired: PRICE.toString(), resource,
      description: "Cronus Capital - verifiable +EV market signal (one call)",
      mimeType: "application/json", payTo: PAY_TO, maxTimeoutSeconds: 120,
      asset: USDC_ASSET, extra: { name: "USDC", version: "2" },
    }],
    error: "X-PAYMENT required: pay " + PRICE.toString() + " atomic USDC to payTo on " + NETWORK + ", then retry with header X-PAYMENT: <txHash>",
  }
}

async function rpc(method, params) {
  const r = await fetch(RPC_URL, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error.message || "rpc error")
  return j.result
}

function extractTxHash(header) {
  const h = String(header || "").trim()
  if (/^0x[0-9a-fA-F]{64}$/.test(h)) return h
  try { const p = JSON.parse(Buffer.from(h, "base64").toString("utf8")); if (p && p.txHash) return String(p.txHash) } catch (_) {}
  try { const p = JSON.parse(h); if (p && p.txHash) return String(p.txHash) } catch (_) {}
  return null
}

async function verifyPayment(txHash) {
  const [receipt, tx] = await Promise.all([
    rpc("eth_getTransactionReceipt", [txHash]),
    rpc("eth_getTransactionByHash", [txHash]),
  ])
  if (!receipt || !tx) return { ok: false, reason: "tx not found / not mined" }
  if (receipt.status !== "0x1") return { ok: false, reason: "tx reverted" }
  let paid = 0n
  let from = String(tx.from || "").toLowerCase()
  for (const l of (receipt.logs || [])) {
    if (l.address && l.address.toLowerCase() === USDC_ASSET && l.topics && l.topics[0] && l.topics[0].toLowerCase() === TRANSFER_TOPIC && l.topics[2]) {
      const to = "0x" + l.topics[2].slice(26).toLowerCase()
      if (to === PAY_TO) { paid += BigInt(l.data); from = "0x" + l.topics[1].slice(26).toLowerCase() }
    }
  }
  if (paid < PRICE && tx.to && tx.to.toLowerCase() === PAY_TO) {
    paid += BigInt(tx.value || "0x0")
  }
  if (paid < PRICE) return { ok: false, reason: "no USDC payment >= " + PRICE.toString() + " to payTo (got " + paid.toString() + ")" }
  try {
    const block = await rpc("eth_getBlockByNumber", [receipt.blockNumber, false])
    const age = Math.floor(Date.now() / 1000) - Number(BigInt(block.timestamp))
    if (age > MAX_AGE_SEC) return { ok: false, reason: "payment older than " + MAX_AGE_SEC + "s (replay window closed)" }
  } catch (_) {}
  return { ok: true, from, amount: paid.toString(), block: receipt.blockNumber }
}

async function generateReport(host, topic, instId) {
  try {
    const r = await fetch("https://" + host + "/api/consult?topic=" + encodeURIComponent(topic) + "&instId=" + encodeURIComponent(instId))
    const j = await r.json()
    if (j && (j.trace || j.verdict)) return j
  } catch (_) {}
  return { ok: false, verdict: "SKIP", conviction: 0, trace: ["oracle unavailable"] }
}

export default async function handler(req, res) {
  const topic = String((req.query && req.query.topic) || "BTC-USDC momentum")
  const instId = String((req.query && req.query.instId) || "BTC-USDC")
  const host = (req.headers && req.headers.host) || "localhost"
  const resource = "https://" + host + "/api/signal?topic=" + encodeURIComponent(topic)

  const header = req.headers["x-payment"]
  if (!header) { res.status(402).json(requirements(resource)); return }

  const txHash = extractTxHash(header)
  if (!txHash) { res.status(402).json({ ...requirements(resource), error: "X-PAYMENT must be an Arc txHash (0x + 64 hex) or base64 JSON { txHash }" }); return }

  let proof
  try { proof = await verifyPayment(txHash) }
  catch (e) { res.status(502).json({ error: "payment verification failed", detail: String((e && e.message) || e) }); return }
  if (!proof.ok) { res.status(402).json({ ...requirements(resource), error: "payment not verified: " + proof.reason, txHash }); return }

  const report = await generateReport(host, topic, instId)
  const settledAt = Date.now()
  const commitment = keccak256(toBytes("CRONUS-SIGNAL|" + txHash + "|" + topic + "|" + (report.verdict || "SKIP") + "|" + (report.conviction || 0) + "|" + settledAt))

  res.setHeader("X-PAYMENT-RESPONSE", Buffer.from(JSON.stringify({ success: true, network: NETWORK, txHash, payer: proof.from, amount: proof.amount })).toString("base64"))
  res.status(200).json({
    paid: true,
    payment: { network: NETWORK, txHash, payer: proof.from, amount: proof.amount, block: proof.block, asset: USDC_ASSET, payTo: PAY_TO, explorer: "https://testnet.arcscan.app/tx/" + txHash },
    commitment,
    settledAt,
    report,
  })
}
