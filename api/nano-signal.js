// api/nano-signal.js — Circle Gateway NANOPAYMENT paywall (ADDITIVE; api/signal.js untouched).
// Sells a micro-signal for $0.001 via Circle Gateway: batched, gas-free settlement (x402 v2).
// Reuses the official @circle-fin/x402-batching middleware, so verifyingContract + USDC
// addresses are fetched live from Circle's facilitator (no hardcoded Gateway address).
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server"

const PAY_TO        = (process.env.CRONUS_PAYTO || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd")
const NETWORK       = process.env.GATEWAY_NETWORK || "eip155:5042002"            // Arc testnet
const FAC_URL       = process.env.GATEWAY_FACILITATOR_URL || "https://gateway-api-testnet.circle.com"
const NANO_PRICE    = process.env.NANO_PRICE_USD || "$0.001"
const NETWORK_LABEL = process.env.X402_NETWORK || "arc-testnet"

const gateway = createGatewayMiddleware({
  sellerAddress: PAY_TO,
  networks: [NETWORK],
  facilitatorUrl: FAC_URL,
  description: "Cronus Capital - NANO micro-signal (Gateway batched, gas-free)",
})
const pay = gateway.require(NANO_PRICE)

// Reuse the same oracle the STANDARD x402 path uses.
async function generateReport(host, topic, instId) {
  try {
    const r = await fetch("https://" + host + "/api/consult?topic=" + encodeURIComponent(topic) + "&instId=" + encodeURIComponent(instId))
    const j = await r.json()
    if (j && (j.trace || j.verdict)) return j
  } catch (_) {}
  return { ok: false, verdict: "SKIP", conviction: 0, trace: ["oracle unavailable"] }
}

// Guarded Upstash/Vercel-KV REST (no-op if env absent) — honest nano traction bookkeeping.
async function kv(cmd) {
  const base  = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return null
  try {
    const r = await fetch(base, { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(cmd) })
    const j = await r.json()
    return j && j.result
  } catch (_) { return null }
}

async function recordTraction(p) {
  const ts = Date.now()
  await Promise.all([
    kv(["INCR", "cronus:nano:calls"]),
    p.payer ? kv(["SADD", "cronus:nano:payers", String(p.payer).toLowerCase()]) : null,
    p.amount ? kv(["INCRBY", "cronus:nano:micros", String(p.amount)]) : null,
    p.transaction ? kv(["SADD", "cronus:nano:settlements", p.transaction]) : null,
    kv(["LPUSH", "cronus:nano:ledger", JSON.stringify({ ...p, ts })]),
    kv(["LTRIM", "cronus:nano:ledger", "0", "199"]),
  ])
}

// Bridge the Express-shaped Gateway middleware to a Vercel serverless handler.
// require() returns an async fn: it resolves after sending 402 (no next) OR after next() on success.
function runGateway(req, res) {
  let called = false
  return Promise.resolve(pay(req, res, () => { called = true })).then(() => called)
}

export default async function handler(req, res) {
  const topic  = String((req.query && req.query.topic) || "BTC-USDC momentum")
  const instId = String((req.query && req.query.instId) || "BTC-USDC")
  const host   = (req.headers && req.headers.host) || "localhost"

  let settled
  try {
    settled = await runGateway(req, res)
  } catch (e) {
    if (!res.writableEnded) res.status(500).json({ error: "nano payment error", detail: String((e && e.message) || e) })
    return
  }
  // 402 / 503 / error already written by the Gateway middleware.
  if (!settled) return

  const payment = req.payment || {}
  const report = await generateReport(host, topic, instId)
  const settledAt = Date.now()
  try {
    await recordTraction({ tier: "NANO", network: payment.network || NETWORK, payer: payment.payer, amount: payment.amount, transaction: payment.transaction })
  } catch (_) {}

  const txUrl = payment.transaction ? "https://testnet.arcscan.app/tx/" + payment.transaction : null
  if (!res.writableEnded) {
    res.status(200).json({
      paid: true,
      tier: "NANO",
      pricing: { tier: "NANO", usd: NANO_PRICE, batched: true, gasFree: true },
      payment: {
        scheme: "exact-batched",
        network: payment.network || NETWORK,
        networkLabel: NETWORK_LABEL,
        payer: payment.payer || null,
        amount: payment.amount || null,
        payTo: PAY_TO,
        settlement: payment.transaction || null,
        explorer: txUrl,
      },
      settledAt,
      report,
    })
  }
}
