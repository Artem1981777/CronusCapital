// api/signal-x402.js — DEDICATED OKX X Layer (eip155:196, USDT0) x402 endpoint.
// Isolated from the Lepton/Arc flow: api/signal.js is untouched. Reuses the shared oracle (/api/consult).
// API-KEY-FREE: verifies the USDT0 payment on-chain via X Layer public RPC (same proven pattern as the Arc
// endpoint), so it needs no OKX facilitator credentials. Builder Code is attached for OKX revenue attribution.
import { keccak256, toBytes } from "viem"

const X402_VERSION = 1
const XLAYER_NETWORK = process.env.OKX_X402_NETWORK || "eip155:196"
const XLAYER_ASSET = (process.env.XLAYER_USDT0_ADDRESS || "0x779Ded0c9e1022225f8E0630b35a9b54bE713736").toLowerCase()
const XLAYER_PAY_TO = (process.env.OKX_ASP_PAYTO || "0xfdd1a3f50dfe522dd430a574d652dd84137ffe8b").toLowerCase()
const XLAYER_PRICE = BigInt(process.env.OKX_SIGNAL_PRICE || "20000") // 0.02 USDT0 (6 decimals)
const BUILDER_CODE = process.env.OKX_BUILDER_CODE || "0m014j21zgfw1r53"
const XLAYER_EXTRA = { name: "USDT0", version: "1" } // EIP-712 token domain
const XLAYER_REVENUE_CREDIT = process.env.OKX_REVENUE_CREDIT_USDC || String(Number(XLAYER_PRICE) / 1e6)
const MAX_AGE_SEC = Number(process.env.OKX_SIGNAL_MAX_AGE_SECONDS || 3600)
const RPC_URLS = ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com", process.env.OKX_X402_RPC_URL].filter(Boolean)
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

function xlayerAccept(resource) {
  return {
    scheme: "exact", network: XLAYER_NETWORK, maxAmountRequired: XLAYER_PRICE.toString(), resource,
    description: "Cronus Capital - verifiable +EV market signal (one call)",
    mimeType: "application/json", payTo: XLAYER_PAY_TO, maxTimeoutSeconds: 120,
    asset: XLAYER_ASSET, extra: XLAYER_EXTRA, builderCode: BUILDER_CODE,
  }
}

function requirements(resource) {
  const origin = String(resource).split("/api/")[0]
  return {
    x402Version: X402_VERSION,
    builderCode: BUILDER_CODE,
    discovery: { manifest: origin + "/api/manifest", openapi: origin + "/api/openapi", receipts: origin + "/api/receipts" },
    accepts: [xlayerAccept(resource)],
    error: "X-PAYMENT required: pay " + XLAYER_PRICE.toString() + " atomic USDT0 to payTo on " + XLAYER_NETWORK + " (X Layer), then retry with header X-PAYMENT set to the txHash",
  }
}

// Accept an Arc-style proof: a raw txHash (0x + 64 hex) or base64/plain JSON { txHash }.
function extractTxHash(header) {
  const h = String(header || "").trim()
  if (/^0x[0-9a-fA-F]{64}$/.test(h)) return h.toLowerCase()
  const tryParse = (s) => {
    try {
      const p = JSON.parse(s)
      const t = p && (p.txHash || p.transaction || p.txId)
      if (t && /^0x[0-9a-fA-F]{64}$/.test(String(t))) return String(t).toLowerCase()
    } catch (_) {}
    return null
  }
  let fromB64 = null
  try { fromB64 = tryParse(Buffer.from(h, "base64").toString("utf8")) } catch (_) {}
  return fromB64 || tryParse(h)
}

async function rpc(method, params) {
  let lastErr = "no rpc endpoint"
  for (const url of RPC_URLS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })
      const text = await r.text()
      let j
      try { j = JSON.parse(text) } catch (_) { lastErr = "non-JSON from " + url + ": " + text.slice(0, 40); continue }
      if (j.error) { lastErr = (j.error && j.error.message) || "rpc error"; continue }
      return j.result
    } catch (e) { lastErr = String((e && e.message) || e); continue }
  }
  throw new Error(lastErr)
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
    if (l.address && l.address.toLowerCase() === XLAYER_ASSET && l.topics && l.topics[0] && l.topics[0].toLowerCase() === TRANSFER_TOPIC && l.topics[2]) {
      const to = "0x" + l.topics[2].slice(26).toLowerCase()
      if (to === XLAYER_PAY_TO) { paid += BigInt(l.data); from = "0x" + l.topics[1].slice(26).toLowerCase() }
    }
  }
  if (paid < XLAYER_PRICE) return { ok: false, reason: "USDT0 paid to payTo below price: got " + paid.toString() + " need " + XLAYER_PRICE.toString() }
  return { ok: true, from, amount: paid.toString(), block: receipt.blockNumber }
}

async function markUsedOnce(txHash) {
  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return { enforced: false, fresh: true }
  try {
    const ttl = Math.max(MAX_AGE_SEC, 86400)
    const r = await fetch(base, { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(["SET", "cronus:used:xlayer:" + txHash, "1", "NX", "EX", String(ttl)]) })
    const j = await r.json()
    return { enforced: true, fresh: !!(j && j.result === "OK") }
  } catch (e) { return { enforced: false, fresh: true } }
}

async function creditPayoutAvailable(usdc) {
  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return null
  try {
    const r = await fetch(base, { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(["INCRBYFLOAT", "cronus:payout:xlayer:available", String(usdc)]) })
    const j = await r.json()
    return j && j.result
  } catch (e) { return null }
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
  const resource = "https://" + host + "/api/signal-x402?topic=" + encodeURIComponent(topic)

  const header = req.headers["x-payment"]
  if (!header) { res.status(402).json(requirements(resource)); return }

  const txHash = extractTxHash(header)
  if (!txHash) { res.status(402).json({ ...requirements(resource), error: "X-PAYMENT must be an X Layer txHash (0x + 64 hex) or base64 JSON { txHash }" }); return }

  let proof
  try { proof = await verifyPayment(txHash) }
  catch (e) { res.status(502).json({ error: "payment verification failed", detail: String((e && e.message) || e) }); return }
  if (!proof.ok) { res.status(402).json({ ...requirements(resource), error: "payment not verified: " + proof.reason, txHash }); return }

  const once = await markUsedOnce(txHash)
  if (once.enforced && !once.fresh) { res.status(402).json({ ...requirements(resource), error: "payment proof already consumed (one-time-use)", txHash }); return }

  await creditPayoutAvailable(XLAYER_REVENUE_CREDIT).catch(function () { return null })
  const report = await generateReport(host, topic, instId)
  const settledAt = Date.now()
  const commitment = keccak256(toBytes("CRONUS-SIGNAL|" + txHash + "|" + topic + "|" + (report.verdict || "SKIP") + "|" + (report.conviction || 0) + "|" + settledAt))

  res.setHeader("X-PAYMENT-RESPONSE", Buffer.from(JSON.stringify({ success: true, network: XLAYER_NETWORK, txHash, payer: proof.from, amount: proof.amount, builderCode: BUILDER_CODE })).toString("base64"))
  res.status(200).json({
    paid: true,
    payment: { network: XLAYER_NETWORK, txHash, payer: proof.from, amount: proof.amount, block: proof.block, asset: XLAYER_ASSET, payTo: XLAYER_PAY_TO, builderCode: BUILDER_CODE, explorer: "https://www.oklink.com/x-layer/tx/" + txHash },
    commitment,
    settledAt,
    report,
  })
}
