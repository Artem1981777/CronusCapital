// lib/cover.js — Cronus Cover: parametric micro-insurance (price-drop protection) on Arc.
// Additive hackathon module (branch hackathon-cover). Reuses Cronus patterns:
// oracle pricing (OKX), keccak256 commitment BEFORE outcome, KV ledger, capped treasury payouts.
// GET  /api/cover                  -> product info + public policy feed
// GET  /api/cover?action=quote     -> no-funds premium quote (&market=BTC-USDC&threshold=2&payout=0.05&horizon=86400)
// POST /api/cover?action=buy       -> open policy: demo mode (labeled) or real via X-PAYMENT txhash
// GET  /api/cover?action=resolve   -> dry-run due policies; POST + Bearer CRON_SECRET -> execute payouts
import { createWalletClient, createPublicClient, http, defineChain, erc20Abi, keccak256, stringToHex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { randomBytes } from "node:crypto"

const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID || "5042002")
const ARC_RPC = process.env.ARC_RPC || process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"
const USDC_ADDRESS = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000")
const EXPLORER = process.env.ARC_EXPLORER || "https://testnet.arcscan.app"
const TREASURY = (process.env.COVER_TREASURY || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd").toLowerCase()
const LEDGER_KEY = "cronus:cover:ledger"
const MAX_PAYOUT = Number(process.env.COVER_MAX_PAYOUT || "0.05")      // USDC per policy (testnet-safe)
const DAILY_CAP = Number(process.env.COVER_DAILY_CAP || "0.25")        // USDC paid out per day
const LOADING = Number(process.env.COVER_LOADING || "1.5")             // premium loading factor
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const arcChain = defineChain({ id: ARC_CHAIN_ID, name: "arc-testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [ARC_RPC] } } })

function normPk(pk) { if (!pk) return null; return pk.startsWith("0x") ? pk : "0x" + pk }
const toAtomic = (usdc) => BigInt(Math.round(Number(usdc) * 1e6))

async function kvCmd(cmd) {
  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return null
  try {
    const r = await fetch(base, { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(cmd) })
    const j = await r.json()
    return j && j.result
  } catch (_) { return null }
}

async function okxTicker(instId) {
  try {
    const r = await fetch("https://www.okx.com/api/v5/market/ticker?instId=" + encodeURIComponent(instId))
    const j = await r.json()
    const d = j && j.data && j.data[0]
    if (!d) return null
    const last = Number(d.last), high = Number(d.high24h), low = Number(d.low24h)
    if (!(last > 0)) return null
    return { last, high, low }
  } catch (_) { return null }
}

// Honest heuristic (labeled): probability of a >=threshold% drop within ~24h,
// proxied by realized 24h range. Not a backtested model — an estimate, priced with loading.
function estimateDropProb(t, thresholdPct) {
  const vol = t.last > 0 && t.high > t.low ? ((t.high - t.low) / t.last) * 100 : 2
  const p = vol / (thresholdPct * 4)
  return Math.min(0.6, Math.max(0.02, p))
}

function quotePolicy(t, thresholdPct, payoutUsdc, horizonSec) {
  const scale = Math.sqrt(Math.max(1, horizonSec) / 86400)
  const prob = Math.min(0.7, estimateDropProb(t, thresholdPct) * scale)
  const premium = Math.max(0.001, Number((payoutUsdc * prob * LOADING).toFixed(6)))
  return { probEstimate: Number(prob.toFixed(4)), premiumUsdc: premium, loading: LOADING, model: "24h-range heuristic (honest estimate, not backtested)" }
}

async function verifyPremiumPaid(txHash, premiumUsdc) {
  try {
    const pub = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })
    const rcpt = await pub.getTransactionReceipt({ hash: txHash })
    if (!rcpt || rcpt.status !== "success") return { ok: false, reason: "tx not found or failed" }
    const need = toAtomic(premiumUsdc)
    for (const log of rcpt.logs || []) {
      if (String(log.address).toLowerCase() !== USDC_ADDRESS.toLowerCase()) continue
      if (!log.topics || log.topics[0] !== TRANSFER_TOPIC) continue
      const to = "0x" + String(log.topics[2] || "").slice(26).toLowerCase()
      if (to !== TREASURY) continue
      if (BigInt(log.data) >= need) return { ok: true, payer: "0x" + String(log.topics[1] || "").slice(26).toLowerCase() }
    }
    return { ok: false, reason: "no USDC transfer of premium amount to treasury in tx" }
  } catch (e) { return { ok: false, reason: String((e && e.message) || e) } }
}

async function paidTodayUsdc(list) {
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0)
  let sum = 0
  for (const p of list) if (p.status === "PAID" && p.resolvedAt && p.resolvedAt >= dayStart.getTime()) sum += Number(p.payoutUsdc || 0)
  return sum
}

async function readLedger() {
  const raw = await kvCmd(["LRANGE", LEDGER_KEY, "0", "199"])
  const list = []
  if (Array.isArray(raw)) for (let i = 0; i < raw.length; i++) { try { const p = JSON.parse(raw[i]); p._idx = i; list.push(p) } catch (_) {} }
  return list
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-PAYMENT")
  if (req.method === "OPTIONS") { res.status(200).end(); return }
  const action = String((req.query && req.query.action) || "").toLowerCase()

  // ---- public info + feed ----
  if (!action) {
    const list = await readLedger()
    const pub = list.map(({ _idx, ...p }) => p)
    return res.status(200).json({
      ok: true, product: "Cronus Cover — parametric price-drop micro-insurance (hackathon module, additive)",
      how: "quote -> buy (premium via x402-style USDC payment, keccak commitment BEFORE outcome) -> auto-resolve at horizon via OKX price (payout or expiry).",
      caps: { maxPayoutUsdc: MAX_PAYOUT, dailyPayoutCapUsdc: DAILY_CAP },
      honesty: "demo policies are labeled demo:true and never counted as real demand; prob model is a heuristic, stated as such.",
      policies: pub.slice(0, 50), count: pub.length
    })
  }

  // ---- quote (no funds) ----
  if (action === "quote") {
    const market = String((req.query && req.query.market) || "BTC-USDC")
    const thresholdPct = Math.max(0.5, Number((req.query && req.query.threshold) || 2))
    const payoutUsdc = Math.min(MAX_PAYOUT, Math.max(0.001, Number((req.query && req.query.payout) || 0.05)))
    const horizonSec = Math.max(3600, Number((req.query && req.query.horizon) || 86400))
    const t = await okxTicker(market)
    if (!t) return res.status(400).json({ ok: false, error: "unknown market or price source down", market })
    const q = quotePolicy(t, thresholdPct, payoutUsdc, horizonSec)
    return res.status(200).json({ ok: true, market, openPrice: t.last, thresholdPct, payoutUsdc, horizonSec, ...q, buy: "POST /api/cover?action=buy with {buyer, market, thresholdPct, payoutUsdc, horizonSec} + header X-PAYMENT: <txhash of premium USDC to treasury> (or demo:true in body)" })
  }

  // ---- buy ----
  if (action === "buy") {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST required" })
    let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b) } catch (_) { b = {} } }
    b = b || {}
    const market = String(b.market || "BTC-USDC")
    const thresholdPct = Math.max(0.5, Number(b.thresholdPct || 2))
    const payoutUsdc = Math.min(MAX_PAYOUT, Math.max(0.001, Number(b.payoutUsdc || 0.05)))
    const horizonSec = Math.max(3600, Number(b.horizonSec || 86400))
    const buyer = String(b.buyer || "").toLowerCase()
    if (!/^0x[0-9a-f]{40}$/.test(buyer)) return res.status(400).json({ ok: false, error: "valid buyer address required" })
    const t = await okxTicker(market)
    if (!t) return res.status(400).json({ ok: false, error: "unknown market", market })
    const q = quotePolicy(t, thresholdPct, payoutUsdc, horizonSec)
    const payTx = String(req.headers["x-payment"] || b.paymentTx || "")
    let demo = !payTx
    if (payTx) {
      const v = await verifyPremiumPaid(payTx, q.premiumUsdc)
      if (!v.ok) return res.status(402).json({ ok: false, error: "premium payment not verified: " + v.reason, premiumUsdc: q.premiumUsdc, payTo: TREASURY })
      demo = false
    }
    const nonce = "0x" + randomBytes(8).toString("hex")
    const core = { market, rule: "drop>=" + thresholdPct + "%", openPrice: t.last, thresholdPct, payoutUsdc, horizonSec, buyer, nonce }
    const commitment = keccak256(stringToHex(JSON.stringify(core)))
    const policy = { id: nonce, ...core, premiumUsdc: q.premiumUsdc, probEstimate: q.probEstimate, commitment, demo, paymentTx: payTx || null, status: "OPEN", openedAt: Date.now(), resolveBy: Date.now() + horizonSec * 1000 }
    await kvCmd(["LPUSH", LEDGER_KEY, JSON.stringify(policy)])
    return res.status(200).json({ ok: true, policy, note: demo ? "DEMO policy (labeled, no funds, never counted as demand)" : "Premium verified on-chain. Commitment recorded BEFORE outcome." })
  }

  // ---- resolve (GET dry-run / POST execute) ----
  if (action === "resolve") {
    const list = await readLedger()
    const due = list.filter((p) => p.status === "OPEN" && p.resolveBy <= Date.now())
    const preview = []
    for (const p of due) {
      const t = await okxTicker(p.market)
      if (!t) { preview.push({ id: p.id, error: "price source down" }); continue }
      const dropPct = ((p.openPrice - t.last) / p.openPrice) * 100
      preview.push({ id: p.id, market: p.market, openPrice: p.openPrice, lastPrice: t.last, dropPct: Number(dropPct.toFixed(3)), thresholdPct: p.thresholdPct, triggered: dropPct >= p.thresholdPct, demo: !!p.demo, payoutUsdc: p.payoutUsdc, _idx: p._idx })
    }
    const qAuthed = !!process.env.CRON_SECRET && String((req.query && req.query.secret) || "") === process.env.CRON_SECRET
    if (req.method === "GET" && !qAuthed) return res.status(200).json({ ok: true, dryRun: true, due: preview, openCount: list.filter((x) => x.status === "OPEN").length })
    const auth = String(req.headers.authorization || "")
    if (!qAuthed && (!process.env.CRON_SECRET || auth !== "Bearer " + process.env.CRON_SECRET)) return res.status(401).json({ ok: false, error: "auth required" })
    const pk = normPk(process.env.COVER_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY)
    const results = []
    let spentToday = await paidTodayUsdc(list)
    for (const pv of preview) {
      const p = list.find((x) => x._idx === pv._idx)
      if (!p) continue
      let update = { ...p, lastPrice: pv.lastPrice, dropPct: pv.dropPct, resolvedAt: Date.now() }
      if (pv.error) continue
      if (!pv.triggered) { update.status = "EXPIRED" }
      else if (p.demo) { update.status = "PAID_DEMO" }
      else if (!pk) { results.push({ id: p.id, error: "no payout key configured" }); continue }
      else if (spentToday + p.payoutUsdc > DAILY_CAP) { results.push({ id: p.id, blocked: "daily payout cap reached (" + DAILY_CAP + " USDC)" }); continue }
      else {
        try {
          const acct = privateKeyToAccount(pk)
          const wallet = createWalletClient({ account: acct, chain: arcChain, transport: http(ARC_RPC) })
          const tx = await wallet.writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "transfer", args: [p.buyer, toAtomic(p.payoutUsdc)] })
          update.status = "PAID"; update.payoutTx = tx; update.explorer = EXPLORER + "/tx/" + tx
          spentToday += p.payoutUsdc
        } catch (e) { results.push({ id: p.id, error: String((e && e.message) || e) }); continue }
      }
      delete update._idx
      await kvCmd(["LSET", LEDGER_KEY, String(p._idx), JSON.stringify(update)])
      results.push({ id: p.id, status: update.status, payoutTx: update.payoutTx || null })
    }
    return res.status(200).json({ ok: true, executed: results })
  }

  return res.status(404).json({ ok: false, error: "unknown action", available: ["", "quote", "buy", "resolve"] })
}
