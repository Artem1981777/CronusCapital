// api/signal-x402.js — DEDICATED OKX X Layer (eip155:196, USDT0) x402 endpoint.
// Isolated from the Lepton/Arc flow: api/signal.js is untouched. Reuses the shared oracle (/api/consult).
import { keccak256, toBytes } from "viem"

const X402_VERSION = 1
const OKX_FACILITATOR = (process.env.OKX_FACILITATOR_URL || "https://web3.okx.com/api/v6/pay/x402").replace(/\/+$/, "")
const OKX_API_KEY = process.env.OKX_API_KEY || ""
const OKX_AUTH_HEADER = process.env.OKX_AUTH_HEADER || "OK-ACCESS-KEY" // confirm exact header in OKX Dev Portal
const XLAYER_NETWORK = process.env.OKX_X402_NETWORK || "eip155:196"
const XLAYER_ASSET = (process.env.XLAYER_USDT0_ADDRESS || "0x779Ded0c9e1022225f8E0630b35a9b54bE713736").toLowerCase()
const XLAYER_PAY_TO = (process.env.OKX_ASP_PAYTO || "0xfdd1a3f50dfe522dd430a574d652dd84137ffe8b").toLowerCase()
const XLAYER_PRICE = BigInt(process.env.OKX_SIGNAL_PRICE || "20000") // 0.02 USDT0 (6 decimals)
let XLAYER_EXTRA = { name: "USDT0", version: "1" } // EIP-712 token domain; confirm name/version for USDT0
try { if (process.env.OKX_ASSET_EXTRA) XLAYER_EXTRA = JSON.parse(process.env.OKX_ASSET_EXTRA) } catch (_) {}
const XLAYER_REVENUE_CREDIT = process.env.OKX_REVENUE_CREDIT_USDC || String(Number(XLAYER_PRICE) / 1e6)

function xlayerAccept(resource) {
  return {
    scheme: "exact", network: XLAYER_NETWORK, maxAmountRequired: XLAYER_PRICE.toString(), resource,
    description: "Cronus Capital - verifiable +EV market signal (one call)",
    mimeType: "application/json", payTo: XLAYER_PAY_TO, maxTimeoutSeconds: 120,
    asset: XLAYER_ASSET, extra: XLAYER_EXTRA,
  }
}

function requirements(resource) {
  const origin = String(resource).split("/api/")[0]
  return {
    x402Version: X402_VERSION,
    discovery: { manifest: origin + "/api/manifest", openapi: origin + "/api/openapi", receipts: origin + "/api/receipts" },
    accepts: [xlayerAccept(resource)],
    error: "X-PAYMENT required: pay " + XLAYER_PRICE.toString() + " atomic USDT0 to payTo on " + XLAYER_NETWORK + ", then retry with header X-PAYMENT",
  }
}

// Parse an x402 signed payment payload (EIP-3009) as sent by OKX / x402 clients.
function parseX402Payload(header) {
  const h = String(header || "").trim()
  const looksX402 = (p) => p && (p.payload || p.authorization || p.scheme || typeof p.x402Version !== "undefined")
  try { const p = JSON.parse(Buffer.from(h, "base64").toString("utf8")); if (looksX402(p)) return p } catch (_) {}
  try { const p = JSON.parse(h); if (looksX402(p)) return p } catch (_) {}
  return null
}

async function okxCall(path, body) {
  const headers = { "content-type": "application/json" }
  if (OKX_API_KEY) headers[OKX_AUTH_HEADER] = OKX_API_KEY
  const r = await fetch(OKX_FACILITATOR + path, { method: "POST", headers, body: JSON.stringify(body) })
  const text = await r.text()
  let j
  try { j = JSON.parse(text) } catch (_) { throw new Error("non-JSON from facilitator " + path + ": " + text.slice(0, 80)) }
  return { status: r.status, body: j }
}

async function generateReport(host, topic, instId) {
  try {
    const r = await fetch("https://" + host + "/api/consult?topic=" + encodeURIComponent(topic) + "&instId=" + encodeURIComponent(instId))
    const j = await r.json()
    if (j && (j.trace || j.verdict)) return j
  } catch (_) {}
  return { ok: false, verdict: "SKIP", conviction: 0, trace: ["oracle unavailable"] }
}

// X Layer revenue -> its OWN payout key, so Lepton/Arc accounting stays untouched.
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

export default async function handler(req, res) {
  if (!OKX_API_KEY) { res.status(503).json({ error: "OKX X Layer endpoint not configured (missing OKX_API_KEY)" }); return }

  const topic = String((req.query && req.query.topic) || "BTC-USDC momentum")
  const instId = String((req.query && req.query.instId) || "BTC-USDC")
  const host = (req.headers && req.headers.host) || "localhost"
  const resource = "https://" + host + "/api/signal-x402?topic=" + encodeURIComponent(topic)

  const header = req.headers["x-payment"]
  if (!header) { res.status(402).json(requirements(resource)); return }

  const payload = parseX402Payload(header)
  if (!payload) { res.status(402).json({ ...requirements(resource), error: "X-PAYMENT must be a signed x402 payment payload (base64 JSON)" }); return }

  const paymentRequirements = xlayerAccept(resource)
  const facBody = { x402Version: X402_VERSION, paymentPayload: payload, paymentRequirements }

  // 1) verify
  let ver
  try { ver = await okxCall("/verify", facBody) }
  catch (e) { res.status(502).json({ error: "okx verify failed", detail: String((e && e.message) || e) }); return }
  const vb = ver.body || {}
  const isValid = (typeof vb.isValid !== "undefined") ? vb.isValid : vb.valid
  if (!isValid) { res.status(402).json({ ...requirements(resource), error: "okx payment not valid: " + (vb.invalidReason || vb.reason || "unknown") }); return }

  // 2) settle
  let set
  try { set = await okxCall("/settle", facBody) }
  catch (e) { res.status(502).json({ error: "okx settle failed", detail: String((e && e.message) || e) }); return }
  const sb = set.body || {}
  const success = (typeof sb.success !== "undefined") ? sb.success : (sb.settled || sb.status === "success")
  if (!success) { res.status(402).json({ ...requirements(resource), error: "okx settlement failed: " + (sb.errorReason || sb.reason || "unknown") }); return }

  const txHash = sb.transaction || sb.txHash || sb.txId || null
  const payer = sb.payer || vb.payer || (payload.payload && payload.payload.authorization && payload.payload.authorization.from) || null

  await creditPayoutAvailable(XLAYER_REVENUE_CREDIT).catch(function () { return null })
  const report = await generateReport(host, topic, instId)
  const settledAt = Date.now()
  const commitment = keccak256(toBytes("CRONUS-SIGNAL|" + (txHash || "okx") + "|" + topic + "|" + (report.verdict || "SKIP") + "|" + (report.conviction || 0) + "|" + settledAt))

  res.setHeader("X-PAYMENT-RESPONSE", Buffer.from(JSON.stringify({ success: true, network: XLAYER_NETWORK, txHash, payer, amount: XLAYER_PRICE.toString() })).toString("base64"))
  res.status(200).json({
    paid: true,
    payment: { network: XLAYER_NETWORK, txHash, payer, amount: XLAYER_PRICE.toString(), asset: XLAYER_ASSET, payTo: XLAYER_PAY_TO, explorer: txHash ? ("https://www.oklink.com/x-layer/tx/" + txHash) : null },
    commitment,
    settledAt,
    report,
  })
}
