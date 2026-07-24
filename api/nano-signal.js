// api/nano-signal.js — Circle Gateway NANOPAYMENT paywall (ADDITIVE; api/signal.js untouched).
// Sells a micro-signal for $0.001 via Circle Gateway: batched, gas-free settlement (x402 v2).
// Reuses the official @circle-fin/x402-batching middleware, so verifyingContract + USDC
// addresses are fetched live from Circle's facilitator (no hardcoded Gateway address).
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server"

// --- ERC-8004 identity gate: the loyal tier requires a registered on-chain identity ---
const IDENTITY_REGISTRY = process.env.IDENTITY_REGISTRY || "0x252cAA46b9b0648908000f6C87e0a561DB4dEb6c"
const ARC_RPC_URL = process.env.ARC_RPC || "https://rpc.blockdaemon.testnet.arc.network"
const _idCache = new Map() // registration is permanent -> cache positives per instance
async function payerRegistered(addr) {
  if (!addr) return false
  if (_idCache.get(addr)) return true
  try {
    const { toFunctionSelector } = await import("viem")
    const data = toFunctionSelector("function isRegistered(address)") + addr.replace(/^0x/, "").toLowerCase().padStart(64, "0")
    const res = await fetch(ARC_RPC_URL, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: IDENTITY_REGISTRY, data: data }, "latest"] }) })
    const j = await res.json()
    if (!j || typeof j.result !== "string") return null
    const reg = BigInt(j.result) !== 0n
    if (reg) _idCache.set(addr, true)
    return reg
  } catch (_) { return null } // RPC hiccup: identity unknown, fail open so sales never break
}

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
const DATASET_PRICE = process.env.DATASET_PRICE_USD || "$0.05"
const payDataset = gateway.require(DATASET_PRICE)
const LOYAL_PRICE  = process.env.NANO_LOYAL_PRICE_USD || "$0.0007"
const payLoyal     = gateway.require(LOYAL_PRICE)
const LOYALTY_MIN  = Number(process.env.LOYALTY_MIN_PURCHASES || "10")

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

async function payerPurchases(addr) {
  if (!addr) return 0
  const n = await kv(["GET", "cronus:nano:count:" + String(addr).toLowerCase()])
  return Number(n || 0)
}

async function recordTraction(p) {
  const ts = Date.now()
  await Promise.all([
    kv(["INCR", "cronus:nano:calls"]),
    p.payer ? kv(["SADD", "cronus:nano:payers", String(p.payer).toLowerCase()]) : null,
    p.payer ? kv(["INCR", "cronus:nano:count:" + String(p.payer).toLowerCase()]) : null,
    p.amount ? kv(["INCRBY", "cronus:nano:micros", String(p.amount)]) : null,
    p.transaction ? kv(["SADD", "cronus:nano:settlements", p.transaction]) : null,
    kv(["LPUSH", "cronus:nano:ledger", JSON.stringify({ ...p, ts })]),
    kv(["LTRIM", "cronus:nano:ledger", "0", "199"]),
  ])
}

// Bridge the Express-shaped Gateway middleware to a Vercel serverless handler.
// require() returns an async fn: it resolves after sending 402 (no next) OR after next() on success.
function runGateway(req, res, mw) {
  let called = false
  return Promise.resolve(mw(req, res, () => { called = true })).then(() => called)
}

export default async function handler(req, res) {
  const topic  = String((req.query && req.query.topic) || "BTC-USDC momentum")
  const instId = String((req.query && req.query.instId) || "BTC-USDC")
  const host   = (req.headers && req.headers.host) || "localhost"
  const tier = (req.query && String(req.query.tier || "")).toLowerCase() === "dataset" ? "dataset" : "nano"
  const payerAddr = String((req.query && req.query.payer) || "").toLowerCase()
  const purchases = await payerPurchases(payerAddr)
  const registered = await payerRegistered(payerAddr)
  const loyal = !!payerAddr && purchases >= LOYALTY_MIN && registered !== false

  // m2m negotiation: free personalized quote (no payment required)
  if (req.query && req.query.quote) {
    return res.status(200).json({
      ok: true, negotiation: "cronus-quote-v1",
      payer: payerAddr || null, purchases, loyal, loyaltyThreshold: LOYALTY_MIN,
      identity: { standard: "ERC-8004", registry: IDENTITY_REGISTRY, registered: registered === null ? "unknown" : registered },
      prices: { nano: NANO_PRICE, nanoLoyal: LOYAL_PRICE, dataset: DATASET_PRICE },
      offered: { tier: tier, price: tier === "dataset" ? DATASET_PRICE : (loyal ? LOYAL_PRICE : NANO_PRICE) },
      note: "loyalty discount at " + LOYALTY_MIN + "+ purchases; loyal tier requires an ERC-8004 registered identity"
    })
  }

  const mw = tier === "dataset" ? payDataset : (loyal ? payLoyal : pay)

  let settled
  try {
    settled = await runGateway(req, res, mw)
  } catch (e) {
    if (!res.writableEnded) res.status(500).json({ error: "nano payment error", detail: String((e && e.message) || e) })
    return
  }
  // 402 / 503 / error already written by the Gateway middleware.
  if (!settled) return

  const payment = req.payment || {}
  if (tier === "dataset") {
    const topics = ["BTC-USDC momentum", "ETH-USDC trend", "SOL-USDC breakout"]
    const rows = []
    for (const tp of topics) {
      const rep = await generateReport(host, tp, instId)
      rows.push({ topic: tp, verdict: rep.verdict || "SKIP", conviction: rep.conviction || 0 })
    }
    const settledAt = Date.now()
    try { await recordTraction({ tier: "DATASET", network: payment.network || NETWORK, payer: payment.payer, amount: payment.amount, transaction: payment.transaction }) } catch (_) {}
    const isOnchainDs = /^0x[0-9a-fA-F]{64}$/.test(String(payment.transaction || ""))
    if (!res.writableEnded) {
      res.status(200).json({
        paid: true,
        tier: "DATASET",
        pricing: { tier: "DATASET", usd: DATASET_PRICE, batched: true, gasFree: true, model: "per-dataset (bulk historical pull)" },
        payment: {
          scheme: "exact-batched",
          verification: "eip3009-signature",
          served: "immediate",
          network: payment.network || NETWORK,
          networkLabel: NETWORK_LABEL,
          payer: payment.payer || null,
          amount: payment.amount || null,
          payTo: PAY_TO,
          settlement: payment.transaction || null,
          settlementType: isOnchainDs ? "onchain" : "gateway-batch",
          settlementNote: isOnchainDs ? null : "EIP-3009 verified, dataset served immediately; Gateway batched settlement id (see README: Arc deviation).",
          explorer: isOnchainDs ? "https://testnet.arcscan.app/tx/" + payment.transaction : null,
        },
        dataset: { count: rows.length, topics, rows },
        settledAt,
      })
    }
    return
  }

  const report = await generateReport(host, topic, instId)
  const settledAt = Date.now()
  try {
    await recordTraction({ tier: "NANO", network: payment.network || NETWORK, payer: payment.payer, amount: payment.amount, transaction: payment.transaction, verdict: report.verdict || null, conviction: (report.conviction != null ? report.conviction : null) })
  } catch (_) {}

  const isOnchainTx = /^0x[0-9a-fA-F]{64}$/.test(String(payment.transaction || ""))
  const txUrl = isOnchainTx ? "https://testnet.arcscan.app/tx/" + payment.transaction : null
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
        verification: "eip3009-signature",
          served: "immediate",
          settlement: payment.transaction || null,
        settlementType: isOnchainTx ? "onchain" : "gateway-batch",
        settlementNote: isOnchainTx ? null : "EIP-3009 signature verified by Circle Gateway and signal served immediately (gas-free); this is the Gateway settlement id. Gateway settles net positions in batches; on Arc testnet these batched settlements are not individually queryable on arcscan (see README: Arc deviation).",
        explorer: txUrl,
      },
      settledAt,
      report,
    })
  }
}
