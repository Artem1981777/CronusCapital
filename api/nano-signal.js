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

// --- ERC-8004 reputation: expose the seller live on-chain rating in every quote ---
const REPUTATION_REGISTRY = process.env.REPUTATION_REGISTRY || "0x2A19ad056EaE83364B0a6420685974cA219c209E"
const SELLER_AGENT_ID = Number(process.env.SELLER_AGENT_ID || "1")
let _repCache = { at: 0, value: null } // 60s TTL; feedback is append-only so staleness is harmless
async function sellerReputation() {
  if (Date.now() - _repCache.at < 60000) return _repCache.value
  try {
    const { toFunctionSelector } = await import("viem")
    const data = toFunctionSelector("function getReputation(uint256)") + SELLER_AGENT_ID.toString(16).padStart(64, "0")
    const res = await fetch(ARC_RPC_URL, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: REPUTATION_REGISTRY, data: data }, "latest"] }) })
    const j = await res.json()
    if (!j || typeof j.result !== "string" || j.result.replace(/^0x/, "").length < 192) return null
    const w = j.result.replace(/^0x/, "")
    const count = Number(BigInt("0x" + w.slice(0, 64)))
    const avgX100 = Number(BigInt("0x" + w.slice(128, 192)))
    const value = { count: count, avg: count ? Math.round(avgX100) / 100 : null }
    _repCache = { at: Date.now(), value: value }
    return value
  } catch (_) { return null } // fail open: reputation unknown, quotes never break
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
// --- conviction-pegged pricing: the loyal price floats with live oracle confidence, hard-clamped to a band ---
const LOYAL_LOW = process.env.NANO_LOYAL_LOW_USD || "$0.0005"
const LOYAL_HIGH = process.env.NANO_LOYAL_HIGH_USD || "$0.0009"
const payLoyalLow = gateway.require(LOYAL_LOW)
const payLoyalHigh = gateway.require(LOYAL_HIGH)
async function convictionNow(host, topic, instId) {
  try {
    const key = "cronus:conv:" + topic
    const cached = await kv(["GET", key])
    if (cached) { const j = JSON.parse(cached); if (Date.now() - j.ts < 600000) return j.c }
    const rep = await generateReport(host, topic, instId)
    const c = rep && rep.conviction != null ? Number(rep.conviction) : null
    if (c !== null) await kv(["SET", key, JSON.stringify({ c: c, ts: Date.now() })])
    return c
  } catch (_) { return null } // fail open: unknown conviction -> standard price
}
function loyalBand(c) {
  if (c === null || c === undefined) return { band: "standard", price: LOYAL_PRICE, mw: payLoyal }
  c = Number(c) > 1 ? Number(c) / 100 : Number(c) // oracle reports 0-100; normalize to 0-1
  if (c >= 0.8) return { band: "premium", price: LOYAL_HIGH, mw: payLoyalHigh }
  if (c < 0.5) return { band: "discount", price: LOYAL_LOW, mw: payLoyalLow }
  return { band: "standard", price: LOYAL_PRICE, mw: payLoyal }
}

const LOYALTY_MIN  = Number(process.env.LOYALTY_MIN_PURCHASES || "10")

// Reuse the same oracle the STANDARD x402 path uses.
// --- signed delivery receipts: the seller cryptographically attests every delivered trade (EIP-191) ---
async function signReceipt(payment, report) {
  const key = process.env.TREASURY_PRIVATE_KEY
  if (!key) return null
  try {
    const { keccak256, stringToHex } = await import("viem")
    const { privateKeyToAccount } = await import("viem/accounts")
    const account = privateKeyToAccount(key.startsWith("0x") ? key : "0x" + key)
    const payload = { receipt: "cronus-delivery-v1", seller: PAY_TO, signer: account.address, payer: payment.payer || null, amountUsd: payment.amount || null, settlement: payment.transaction || null, reportHash: keccak256(stringToHex(JSON.stringify(report))), verdict: (report && report.verdict) || null, ts: Date.now() }
    const signature = await account.signMessage({ message: JSON.stringify(payload) })
    return { standard: "EIP-191", payload: payload, signature: signature, verify: "recover signer from signature over JSON.stringify(payload); reportHash = keccak256(utf8 of JSON.stringify(report))" }
  } catch (_) { return null } // fail open: a missing receipt never blocks a sale
}

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

// --- track record: the market grades our past signals; hash-anchored history cannot be rewritten ---
let _trCache = { t: 0, v: null }
async function trackRecord() {
  if (Date.now() - _trCache.t < 300000) return _trCache.v
  try {
    const u = "https:" + "//raw.githubusercontent.com/Artem1981777/CronusCapital/main/m2m-ledger/track-record.json"
    const r = await fetch(u)
    if (!r.ok) throw new Error("HTTP " + r.status)
    const j = await r.json()
    const s = (j && j.stats) || null
    _trCache = { t: Date.now(), v: s && s.updatedAt ? { standard: "cronus-track-record-v1", judge: "market outcomes, not self-review", graded: s.graded, hits: s.hits, hitRate: s.hitRate, abstained: s.abstained, calibration: s.calibration || null, proof: "receipts pin each reportHash; ledger files are keccak-anchored on-chain" } : null }
  } catch (_) { _trCache = { t: Date.now(), v: null } } // fail open
  return _trCache.v
}

// --- calibration gate: the premium band must be earned; the market Brier score judges the seller confidence ---
const CAL_MAX_BRIER = Number(process.env.CAL_MAX_BRIER || "0.35")
const CAL_MIN_GRADED = Number(process.env.CAL_MIN_GRADED || "3")
async function calibrationGate() {
  try {
    const s = await trackRecord()
    const cal = s && s.calibration ? s.calibration : null
    if (!cal || cal.brierAvg == null || Number(cal.scored || 0) < CAL_MIN_GRADED) return { ok: true, reason: "not enough market-graded signals yet (fail open)", cal: cal }
    const ok = Number(cal.brierAvg) <= CAL_MAX_BRIER
    return { ok: ok, reason: ok ? "well-calibrated: brierAvg " + cal.brierAvg + " within " + CAL_MAX_BRIER : "overconfident: brierAvg " + cal.brierAvg + " above " + CAL_MAX_BRIER + " -> premium band demoted", cal: cal }
  } catch (_) { return { ok: true, reason: "calibration unavailable (fail open)", cal: null } }
}

// --- trade credit: deterministic credit line for loyal ERC-8004 buyers; the buyer repays on later runs ---
const CREDIT_LIMIT_UNITS = Number(process.env.CREDIT_LIMIT_UNITS || "3")
async function creditUnits(addr) {
  if (!addr) return 0
  const n = await kv(["GET", "cronus:credit:units:" + String(addr).toLowerCase()])
  return Math.max(0, Number(n || 0))
}

// --- conviction stake: every paid signal is backed by a stake; the market-graded track record is the only judge ---
async function stakeStatus() {
  const s = await trackRecord()
  const misses = s ? Math.max(0, Number(s.graded || 0) - Number(s.hits || 0)) : 0
  const redeemed = Number(await kv(["SCARD", "cronus:stake:redeemed"]) || 0)
  return { model: "conviction-stake", stakePerSignal: LOYAL_PRICE, judge: "market-graded track record, no LLM", misses: misses, redeemed: redeemed, owedMakeGoods: Math.max(0, misses - redeemed) }
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
  const creditDebt = await creditUnits(payerAddr)
  const creditEligible = !!(loyal && creditDebt < CREDIT_LIMIT_UNITS)
  const conv = loyal ? await convictionNow(host, topic, instId) : null
  const lbRaw = loyalBand(conv)
  const calGate = loyal ? await calibrationGate() : { ok: true, reason: null, cal: null }
  const lb = lbRaw.band === "premium" && !calGate.ok ? loyalBand(0.7) : lbRaw

  // m2m negotiation: free personalized quote (no payment required)
  if (req.query && req.query.quote) {
    // m2m haggling: deterministic counteroffer rule, no LLM in the loop
    const counterRaw = String(req.query.counter || "")
    if (counterRaw) {
      const order = ["discount", "standard", "premium"]
      const want = counterRaw === LOYAL_LOW ? "discount" : counterRaw === LOYAL_PRICE ? "standard" : counterRaw === LOYAL_HIGH ? "premium" : null
      const ok = !!(loyal && want !== null && order.indexOf(want) === order.indexOf(lb.band) - 1)
      if (ok) await kv(["SET", "cronus:nego:" + payerAddr, want, "EX", "600"])
      return res.status(200).json({
        ok: true, negotiation: "cronus-counter-v1", accepted: ok,
        band: ok ? want : lb.band, price: ok ? counterRaw : (loyal ? lb.price : NANO_PRICE),
        rule: "deterministic: a loyal buyer can talk the price exactly one band down; the discount floor is never crossed",
        expiresInSec: ok ? 600 : null,
        reason: ok ? "accepted: loyalty earned one concession step" : "rejected: current band is " + lb.band + "; only one band down is negotiable for loyal buyers"
      })
    }
    const sellerRep = await sellerReputation()
    return res.status(200).json({
      ok: true, negotiation: "cronus-quote-v1",
      payer: payerAddr || null, purchases, loyal, loyaltyThreshold: LOYALTY_MIN,
      identity: { standard: "ERC-8004", registry: IDENTITY_REGISTRY, registered: registered === null ? "unknown" : registered },
      signalAccuracy: await trackRecord(),
      sellerReputation: { standard: "ERC-8004", registry: REPUTATION_REGISTRY, agentId: SELLER_AGENT_ID, feedbacks: sellerRep ? sellerRep.count : null, avg: sellerRep ? sellerRep.avg : null },
      credit: { eligible: creditEligible, unitPrice: LOYAL_PRICE, unitsOutstanding: creditDebt, limit: CREDIT_LIMIT_UNITS, note: "loyal buyers can take a signal on credit and repay at the loyal price on a later run" },
      stake: await stakeStatus(),
      calibration: { standard: "cronus-calibration-v1", judge: "Brier score vs market outcomes, no self-review", rule: "premium band requires brierAvg within " + CAL_MAX_BRIER + " over " + CAL_MIN_GRADED + "+ graded signals", status: calGate.ok ? "pass" : "premium-demoted", detail: calGate.reason, stats: calGate.cal },
      prices: { nano: NANO_PRICE, nanoLoyal: LOYAL_PRICE, dataset: DATASET_PRICE },
      offered: { tier: tier, price: tier === "dataset" ? DATASET_PRICE : (loyal ? lb.price : NANO_PRICE) },
      convictionPricing: loyal ? { model: "conviction-pegged", conviction: conv, band: lb.band, bands: { discount: LOYAL_LOW, standard: LOYAL_PRICE, premium: LOYAL_HIGH }, note: "loyal price floats with live oracle confidence, hard-clamped to the band range" } : null,
      note: "loyalty discount at " + LOYALTY_MIN + "+ purchases; loyal tier requires an ERC-8004 registered identity"
    })
  }

  const negoBand = loyal ? await kv(["GET", "cronus:nego:" + payerAddr]) : null
  const negoMw = negoBand === "discount" ? payLoyalLow : negoBand === "standard" ? payLoyal : negoBand === "premium" ? payLoyalHigh : null
  // trade credit: repay one outstanding unit at the loyal price (real x402 payment)
  if (req.query && req.query.repay) {
    if (creditDebt <= 0) return res.status(400).json({ error: "nothing to repay", unitsOutstanding: 0 })
    let okRepay = false
    try { okRepay = await runGateway(req, res, payLoyal) } catch (e) { if (!res.writableEnded) res.status(500).json({ error: "repay payment error", detail: String((e && e.message) || e) }); return }
    if (!okRepay) return
    const pay2 = req.payment || {}
    await kv(["DECR", "cronus:credit:units:" + payerAddr])
    try { await recordTraction({ tier: "CREDIT_REPAY", network: pay2.network || NETWORK, payer: pay2.payer, amount: pay2.amount, transaction: pay2.transaction }) } catch (_) {}
    if (!res.writableEnded) res.status(200).json({ paid: true, repaid: true, creditStatus: { unitsOutstanding: Math.max(0, creditDebt - 1), limit: CREDIT_LIMIT_UNITS } })
    return
  }
  // trade credit: eligible loyal buyers take the signal now, debt is tracked deterministically
  if (req.query && req.query.credit) {
    if (!creditEligible) return res.status(402).json({ error: "credit refused", reason: loyal ? "credit limit reached" : "credit is for loyal, ERC-8004 registered buyers", unitsOutstanding: creditDebt, limit: CREDIT_LIMIT_UNITS })
    const creditReport = await generateReport(host, topic, instId)
    await kv(["INCR", "cronus:credit:units:" + payerAddr])
    try { await recordTraction({ tier: "NANO_CREDIT", payer: payerAddr, verdict: creditReport.verdict || null }) } catch (_) {}
    return res.status(200).json({ paid: false, credit: true, creditStatus: { unitsOutstanding: creditDebt + 1, limit: CREDIT_LIMIT_UNITS, unitPrice: LOYAL_PRICE }, report: creditReport })
  }
  // conviction stake: a market-graded MISS entitles the buyer to one free make-good unit
  if (req.query && req.query.makegood) {
    const mgKey = String(req.query.makegood)
    if (!loyal) return res.status(402).json({ error: "make-good refused", reason: "make-goods are for loyal, ERC-8004 registered buyers" })
    const st = await stakeStatus()
    if (st.owedMakeGoods <= 0) return res.status(409).json({ error: "make-good refused", reason: "no unredeemed market-graded misses", stake: st })
    const already = await kv(["SISMEMBER", "cronus:stake:redeemed", mgKey])
    if (Number(already || 0) > 0) return res.status(409).json({ error: "make-good refused", reason: "this miss was already redeemed", key: mgKey })
    const mgReport = await generateReport(host, topic, instId)
    await kv(["SADD", "cronus:stake:redeemed", mgKey])
    try { await recordTraction({ tier: "STAKE_MAKEGOOD", payer: payerAddr, verdict: mgReport.verdict || null }) } catch (_) {}
    return res.status(200).json({ paid: false, makeGood: true, key: mgKey, stake: { model: st.model, misses: st.misses, redeemed: st.redeemed + 1, owedMakeGoods: st.owedMakeGoods - 1 }, report: mgReport })
  }
  const mw = tier === "dataset" ? payDataset : (negoMw || (loyal ? lb.mw : pay))

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
  if (negoBand) { try { await kv(["DEL", "cronus:nego:" + payerAddr]) } catch (_) {} } // one negotiated deal per handshake
  const settledAt = Date.now()
  try {
    await recordTraction({ tier: "NANO", network: payment.network || NETWORK, payer: payment.payer, amount: payment.amount, transaction: payment.transaction, verdict: report.verdict || null, conviction: (report.conviction != null ? report.conviction : null) })
  } catch (_) {}

  const isOnchainTx = /^0x[0-9a-fA-F]{64}$/.test(String(payment.transaction || ""))
  const deliveryReceipt = await signReceipt(payment, report)
  const txUrl = isOnchainTx ? "https://testnet.arcscan.app/tx/" + payment.transaction : null
  if (!res.writableEnded) {
    res.status(200).json({
      paid: true,
      tier: "NANO",
        pricing: { tier: "NANO", usd: NANO_PRICE, batched: true, gasFree: true, negotiatedBand: negoBand || null },
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
      deliveryReceipt: deliveryReceipt,
        stake: { model: "conviction-stake", note: "if the market grades this signal a MISS within 24h, the buyer is owed one free make-good unit" },
    })
  }
}
