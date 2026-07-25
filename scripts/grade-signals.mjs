#!/usr/bin/env node
// scripts/grade-signals.mjs - the market grades our past signals (no self-review).
// BUY entries older than 24h are compared against the real price move; results are public.
// Receipts already pin each report hash and ledger files are anchored on-chain,
// so this track record cannot be quietly rewritten.
import fs from "node:fs"
import path from "node:path"

const DIR = "m2m-ledger"
const TR = path.join(DIR, "track-record.json")
const MAX_PER_RUN = Number(process.env.GRADE_MAX_PER_RUN || "5")
const HORIZON = 24 * 3600 * 1000
const COINS = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana" }
const BULL = ["BUY", "LONG", "BULLISH", "UP"]
const BEAR = ["SELL", "SHORT", "BEARISH", "DOWN"]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function loadTR() {
  try { return JSON.parse(fs.readFileSync(TR, "utf8")) } catch (_) { return { standard: "cronus-track-record-v1", judge: "market outcomes via public price data", records: [], stats: {} } }
}

async function priceNear(coin, tsMs) {
  const from = Math.floor(tsMs / 1000) - 5400
  const to = Math.floor(tsMs / 1000) + 5400
  const u = "https:" + "//api.coingecko.com/api/v3/coins/" + coin + "/market_chart/range?vs_currency=usd&from=" + from + "&to=" + to
  const r = await fetch(u)
  if (!r.ok) throw new Error("coingecko HTTP " + r.status)
  const j = await r.json()
  const pts = (j && j.prices) || []
  if (!pts.length) throw new Error("no price points for " + coin)
  let best = pts[0]
  for (const p of pts) if (Math.abs(p[0] - tsMs) < Math.abs(best[0] - tsMs)) best = p
  return best[1]
}

const tr = loadTR()
const done = new Set(tr.records.map((r) => r.key))
const files = fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
const candidates = []
for (const f of files) {
  let arr = []
  try { arr = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) } catch (_) { continue }
  for (const e of arr) {
    if (e.action !== "BUY" || !e.quality || !e.quality.verdict) continue
    const ts = Date.parse(e.ts)
    if (!ts || Date.now() - ts < HORIZON) continue
    const key = String(e.settlement || e.ts)
    if (done.has(key)) continue
    candidates.push({ key, ts, topic: e.topic || "", verdict: String(e.quality.verdict).toUpperCase(), conviction: e.quality.conviction != null ? Number(e.quality.conviction) : null })
  }
}
console.log("[grade] candidates: " + candidates.length)

let apiCalls = 0
for (const c of candidates) {
  const sym = (c.topic.match(/[A-Z]+/) || [""])[0]
  const coin = COINS[sym]
  const dir = BULL.includes(c.verdict) ? 1 : BEAR.includes(c.verdict) ? -1 : 0
  if (dir === 0) {
    tr.records.push({ key: c.key, ts: new Date(c.ts).toISOString(), topic: c.topic, verdict: c.verdict, result: "ABSTAIN" })
    console.log("[grade] " + c.verdict + " on " + c.topic + " -> ABSTAIN (no direction to grade)")
    continue
  }
  if (!coin) {
    tr.records.push({ key: c.key, ts: new Date(c.ts).toISOString(), topic: c.topic, verdict: c.verdict, result: "UNGRADABLE" })
    continue
  }
  if (apiCalls >= MAX_PER_RUN) { console.log("[grade] per-run cap reached, the rest waits for the next run"); break }
  apiCalls++
  try {
    const p0 = await priceNear(coin, c.ts)
    await sleep(1500)
    const p1 = await priceNear(coin, c.ts + HORIZON)
    await sleep(1500)
    const movePct = Math.round(((p1 - p0) / p0) * 10000) / 100
    const hit = dir * (p1 - p0) > 0
    const pConf = c.conviction == null ? null : Math.min(1, Math.max(0, Number(c.conviction) > 1 ? Number(c.conviction) / 100 : Number(c.conviction)))
    const brier = pConf == null ? null : Math.round(Math.pow(pConf - (hit ? 1 : 0), 2) * 1000) / 1000
    tr.records.push({ key: c.key, ts: new Date(c.ts).toISOString(), topic: c.topic, verdict: c.verdict, result: "GRADED", conviction: c.conviction, brier: brier, priceAtSignal: p0, priceAfter24h: p1, movePct: movePct, hit: hit, gradedAt: new Date().toISOString() })
    console.log("[grade] " + c.verdict + " on " + c.topic + " -> move " + movePct + "% -> " + (hit ? "HIT" : "MISS"))
  } catch (e) {
    console.log("[grade] skipped " + c.key + ": " + String((e && e.message) || e))
  }
}

const gradedArr = tr.records.filter((r) => r.result === "GRADED")
const hits = gradedArr.filter((r) => r.hit).length
const briers = gradedArr.filter((r) => r.brier != null).map((r) => r.brier)
tr.stats = {
  graded: gradedArr.length,
  hits: hits,
  hitRate: gradedArr.length ? Math.round((hits / gradedArr.length) * 100) + "%" : null,
  abstained: tr.records.filter((r) => r.result === "ABSTAIN").length,
  calibration: briers.length ? { standard: "cronus-calibration-v1", scored: briers.length, brierAvg: Math.round((briers.reduce((s, b) => s + b, 0) / briers.length) * 1000) / 1000, note: "Brier = (conviction - outcome)^2: 0 perfect, 0.25 coin-flip; market outcomes judge the stated confidence" } : null,
  updatedAt: new Date().toISOString(),
}
fs.writeFileSync(TR, JSON.stringify(tr, null, 2))
console.log("[grade] track record -> " + TR + " | " + JSON.stringify(tr.stats))
