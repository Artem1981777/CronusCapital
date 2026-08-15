import crypto from "crypto"

const X402_VERSION = 1
const NETWORK = process.env.X402_NETWORK || "arc-testnet"
const USDC_ASSET = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase()
const PAY_TO = (process.env.CRONUS_PAYTO || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd").toLowerCase()
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const RPC_URLS = ["https://rpc.testnet.arc.network", process.env.SIGNAL_RPC_URL, process.env.VITE_RPC_URL, process.env.RPC_URL].filter(Boolean)
const MAX_AGE_SEC = Number(process.env.SIGNAL_MAX_AGE_SECONDS || "1800")
const PREMIUM_BPS = Number(process.env.INSURANCE_PREMIUM_BPS || "500")
const RESERVE_BPS = Number(process.env.INSURANCE_RESERVE_BPS || "2000")
const COVERAGE_SEC = Number(process.env.INSURANCE_COVERAGE_SEC || "86400")
const MISS_THRESHOLD = Number(process.env.INSURANCE_MISS_CONVICTION || "50")

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ""
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ""

async function kvCmd(path) {
  if (!KV_URL || !KV_TOKEN) return null
  try {
    const r = await fetch(KV_URL + path, { headers: { Authorization: "Bearer " + KV_TOKEN } })
    if (!r.ok) return null
    const j = await r.json()
    return j.result
  } catch (e) { return null }
}
async function kvGet(key) { return await kvCmd("/get/" + encodeURIComponent(key)) }
async function kvSet(key, val) { return await kvCmd("/set/" + encodeURIComponent(key) + "/" + encodeURIComponent(val)) }
async function kvLpush(key, val) { return await kvCmd("/lpush/" + encodeURIComponent(key) + "/" + encodeURIComponent(val)) }
async function kvIncrByFloat(key, n) { return await kvCmd("/incrbyfloat/" + encodeURIComponent(key) + "/" + encodeURIComponent(String(n))) }

async function markUsedOnce(txHash) {
  if (!KV_URL || !KV_TOKEN) return { enforced: false, fresh: true }
  try {
    const ttl = Math.max(MAX_AGE_SEC, COVERAGE_SEC * 2)
    const r = await fetch(KV_URL, { method: "POST", headers: { Authorization: "Bearer " + KV_TOKEN, "content-type": "application/json" }, body: JSON.stringify(["SET", "cronus:insurance:used:" + txHash, "1", "NX", "EX", String(ttl)]) })
    const j = await r.json()
    return { enforced: true, fresh: !!(j && j.result === "OK") }
  } catch (e) { return { enforced: false, fresh: true } }
}

async function rpc(method, params) {
  let lastErr = "no rpc endpoint"
  for (const url of RPC_URLS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })
      const text = await r.text()
      let j
      try { j = JSON.parse(text) } catch (e) { lastErr = "non-JSON from " + url; continue }
      if (j.error) { lastErr = (j.error && j.error.message) || "rpc error"; continue }
      return j.result
    } catch (e) { lastErr = String((e && e.message) || e); continue }
  }
  throw new Error(lastErr)
}

function extractTxHash(header) {
  const h = String(header || "").trim()
  if (/^0x[0-9a-fA-F]{64}$/.test(h)) return h
  try { const p = JSON.parse(Buffer.from(h, "base64").toString("utf8")); if (p && p.txHash) return String(p.txHash) } catch (e) {}
  try { const p = JSON.parse(h); if (p && p.txHash) return String(p.txHash) } catch (e) {}
  return null
}

async function verifyPayment(txHash, minAtomic) {
  const [receipt, tx] = await Promise.all([rpc("eth_getTransactionReceipt", [txHash]), rpc("eth_getTransactionByHash", [txHash])])
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
  if (paid < minAtomic && tx.to && tx.to.toLowerCase() === PAY_TO) { paid += BigInt(tx.value || "0x0") }
  if (paid < minAtomic) return { ok: false, reason: "premium underpaid: got " + paid.toString() + " need " + minAtomic.toString() }
  try {
    const block = await rpc("eth_getBlockByNumber", [receipt.blockNumber, false])
    const age = Math.floor(Date.now() / 1000) - Number(BigInt(block.timestamp))
    if (age > MAX_AGE_SEC) return { ok: false, reason: "payment older than " + MAX_AGE_SEC + "s (replay window closed)" }
  } catch (e) {}
  return { ok: true, from, amount: paid.toString(), block: receipt.blockNumber }
}

function premiumAtomic(notional) {
  const n = Math.max(0, Number(notional) || 0)
  return BigInt(Math.round(n * (PREMIUM_BPS / 10000) * 1e6))
}

function requirements(resource, minAtomic) {
  const origin = String(resource).split("/api/")[0]
  return {
    x402Version: X402_VERSION,
    discovery: { manifest: origin + "/api/manifest", openapi: origin + "/api/openapi", receipts: origin + "/api/receipts" },
    accepts: [{ scheme: "exact", network: NETWORK, maxAmountRequired: minAtomic.toString(), resource, description: "Cronus signal insurance premium (money-back if conviction < " + MISS_THRESHOLD + ")", mimeType: "application/json", payTo: PAY_TO, maxTimeoutSeconds: 120, asset: USDC_ASSET, extra: { name: "USDC", version: "2" } }],
    error: "X-PAYMENT required: pay " + minAtomic.toString() + " atomic USDC to payTo on " + NETWORK + ", then retry with header X-PAYMENT: <txHash>",
  }
}

async function getConviction(host, topic, instId) {
  try {
    const r = await fetch("https://" + host + "/api/consult?topic=" + encodeURIComponent(topic) + "&instId=" + encodeURIComponent(instId))
    const j = await r.json()
    return { verdict: j.verdict || null, conviction: j.conviction != null ? Number(j.conviction) : null, traceHash: j.traceHash || j.hash || null }
  } catch (e) { return { verdict: null, conviction: null, traceHash: null } }
}

async function readReserve() { const v = await kvGet("cronus:insurance:reserve"); return Number(v || 0) }
function normTopic(t) { return String(t || "").toLowerCase() }

async function checkMiss(host, topic, instId, boughtAtMs) {
  try {
    const r = await fetch("https://" + host + "/api/decisions?limit=100")
    const j = await r.json()
    const rows = (j && j.decisions) || []
    const key = normTopic(instId) || normTopic(topic).split(" ")[0]
    const lo = boughtAtMs - COVERAGE_SEC * 1000
    const hi = boughtAtMs + COVERAGE_SEC * 1000
    for (const d of rows) {
      const dt = normTopic(d.topic)
      const tms = d.timestamp ? d.timestamp * 1000 : boughtAtMs
      const inWindow = tms >= lo && tms <= hi
      if (key && dt.includes(key) && inWindow && Number(d.confidence) < MISS_THRESHOLD) {
        return { miss: true, evidence: { index: d.index, topic: d.topic, action: d.action, confidence: d.confidence, ts: d.ts, traceHashShort: d.traceHashShort } }
      }
    }
  } catch (e) {}
  return { miss: false, evidence: null }
}

export default async function insurance(req, res) {
  const q = req.query || {}
  const kind = String(q.kind || "").toLowerCase()
  const action = kind.includes("buy") ? "buy" : kind.includes("status") ? "status" : "quote"
  const host = (req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "cronus-capital.vercel.app"
  const topic = String(q.topic || "BTC-USDC momentum")
  const instId = String(q.instId || "BTC-USDC")
  const notional = Number(q.notional || 0)

  try {
    if (action === "quote") {
      const prem = premiumAtomic(notional)
      const conv = await getConviction(host, topic, instId)
      const reserve = await readReserve()
      res.status(200).json({
        ok: true, product: "cronus_signal_insurance", network: NETWORK, instId, topic, notional_usdc: notional,
        premium_atomic: prem.toString(), premium_usdc: Number(prem) / 1e6, premium_bps: PREMIUM_BPS,
        payout_on_miss_usdc: Number(prem) / 1e6, payout_rule: "full premium refund (money-back)",
        coverage_window_hours: Math.round(COVERAGE_SEC / 3600),
        miss_definition: "a Cronus decision on this topic with conviction < " + MISS_THRESHOLD + " within the coverage window (verifiable on-chain via /api/decisions)",
        current_conviction: conv.conviction, current_verdict: conv.verdict, trace_hash: conv.traceHash,
        insurance_reserve_usdc: reserve, reserve_bps_of_premium: RESERVE_BPS,
        how_to_buy: ["1. Pay premium_atomic USDC to payTo on " + NETWORK + " via an x402 wallet.", "2. Call cronus_insurance_buy with same notional/topic and header X-PAYMENT: <txHash>.", "3. Check cronus_insurance_status to claim a refund if Cronus is wrong."],
        pay_to: PAY_TO, asset: USDC_ASSET,
        honest_note: "Demo insurance on testnet. Refunds honored from Cronus's self-operated treasury; insurance_reserve tracks a " + (RESERVE_BPS / 100) + "% claims buffer accrued from premiums. No external underwriter.",
        updatedAt: new Date().toISOString(),
      })
      return
    }

    if (action === "buy") {
      const resource = "https://" + host + "/api/insurance-buy?notional=" + encodeURIComponent(String(notional)) + "&topic=" + encodeURIComponent(topic)
      const prem = premiumAtomic(notional)
      if (prem <= 0n) { res.status(400).json({ ok: false, error: "notional (> 0) required to price the premium" }); return }
      const header = req.headers["x-payment"]
      if (!header) { res.status(402).json(requirements(resource, prem)); return }
      const txHash = extractTxHash(header)
      if (!txHash) { res.status(402).json({ ...requirements(resource, prem), error: "X-PAYMENT must be an Arc txHash (0x + 64 hex) or base64 JSON { txHash }" }); return }
      let proof
      try { proof = await verifyPayment(txHash, prem) } catch (e) { res.status(502).json({ ok: false, error: "payment verification failed", detail: String((e && e.message) || e) }); return }
      if (!proof.ok) { res.status(402).json({ ...requirements(resource, prem), error: "payment not verified: " + proof.reason, txHash }); return }
      const once = await markUsedOnce(txHash)
      if (once.enforced && !once.fresh) { res.status(402).json({ ...requirements(resource, prem), error: "payment proof already consumed (one-time-use)", txHash }); return }
      const now = Date.now()
      const policyId = crypto.createHash("sha256").update(txHash + "|" + topic + "|" + notional).digest("hex").slice(0, 16)
      const reserveAdd = (Number(prem) / 1e6) * (RESERVE_BPS / 10000)
      const policy = {
        policy_id: policyId, product: "cronus_signal_insurance", status: "active", instId, topic, notional_usdc: notional,
        premium_atomic: proof.amount, premium_usdc: Number(proof.amount) / 1e6, payout_on_miss_usdc: Number(prem) / 1e6, payer: proof.from,
        payment: { network: NETWORK, txHash, block: proof.block, asset: USDC_ASSET, payTo: PAY_TO, explorer: "https://testnet.arcscan.app/tx/" + txHash },
        bought_at: new Date(now).toISOString(), bought_at_ms: now,
        coverage_until_ms: now + COVERAGE_SEC * 1000, coverage_until: new Date(now + COVERAGE_SEC * 1000).toISOString(),
        miss_threshold: MISS_THRESHOLD, reserve_contribution_usdc: reserveAdd,
      }
      await kvSet("cronus:insurance:policy:" + policyId, JSON.stringify(policy))
      await kvLpush("cronus:insurance:list", policyId)
      const newReserve = await kvIncrByFloat("cronus:insurance:reserve", reserveAdd)
      res.setHeader("X-PAYMENT-RESPONSE", Buffer.from(JSON.stringify({ success: true, network: NETWORK, txHash, payer: proof.from, amount: proof.amount })).toString("base64"))
      res.status(200).json({ ok: true, paid: true, policy, insurance_reserve_usdc: Number(newReserve || 0), check: "cronus_insurance_status?policy_id=" + policyId, honest_note: "Premium verified on-chain (real x402). Refund honored from self-operated treasury if MISS. Testnet demo.", updatedAt: new Date().toISOString() })
      return
    }

    const policyId = String(q.policy_id || q.id || "")
    if (!policyId) { res.status(400).json({ ok: false, error: "policy_id required" }); return }
    const raw = await kvGet("cronus:insurance:policy:" + policyId)
    if (!raw) { res.status(404).json({ ok: false, error: "policy not found", policy_id: policyId }); return }
    let policy
    try { policy = typeof raw === "string" ? JSON.parse(raw) : raw } catch (e) { res.status(500).json({ ok: false, error: "policy parse error" }); return }
    const now = Date.now()
    const expired = now > Number(policy.coverage_until_ms || 0)
    const miss = await checkMiss(host, policy.topic, policy.instId, Number(policy.bought_at_ms || 0))
    let changed = false
    if (policy.status === "active" && miss.miss) {
      policy.status = "refunded"
      policy.refund_usdc = Number(policy.payout_on_miss_usdc || 0)
      policy.refund_reason = "MISS: on-chain decision conviction < " + MISS_THRESHOLD + " within coverage window"
      policy.miss_evidence = miss.evidence
      policy.refunded_at = new Date(now).toISOString()
      await kvSet("cronus:insurance:policy:" + policyId, JSON.stringify(policy))
      await kvIncrByFloat("cronus:insurance:reserve", -Number(policy.payout_on_miss_usdc || 0))
      changed = true
    } else if (policy.status === "active" && expired) {
      policy.status = "expired"
      await kvSet("cronus:insurance:policy:" + policyId, JSON.stringify(policy))
      changed = true
    }
    const reserve = await readReserve()
    res.status(200).json({ ok: true, policy, insurance_reserve_usdc: reserve, claimable: policy.status === "refunded", state_changed: changed, miss_check: miss, note: "Status derived from on-chain /api/decisions + coverage window. Refund = full premium on MISS; reserve adjusted.", updatedAt: new Date().toISOString() })
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) })
  }
}
