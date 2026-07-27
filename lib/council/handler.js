// lib/council/handler.js — HTTP-вход настоящего совета. ADDITIVE.
// Живые котировки OKX (тот же источник, что и api/consult.js) + голоса реальных моделей.
// Нет ключей => честный отказ, а не выдуманный консенсус.
import { runCouncil } from "./council.js"

const OKX = "https://www.okx.com/api/v5/market/ticker?instId="
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null }

// fetchImpl инжектируемый => функция проверяема офлайн
export async function fetchMarket(instId, fetchImpl) {
  const f = fetchImpl || fetch
  const r = await f(OKX + encodeURIComponent(instId))
  const j = await r.json()
  const d = j && j.data && j.data[0]
  if (!d) return null
  const price = num(d.last)
  const open = num(d.open24h)
  return {
    instId,
    price,
    high24h: num(d.high24h),
    low24h: num(d.low24h),
    vol24h: num(d.vol24h),
    turnover24h: num(d.volCcy24h),
    changePct: price != null && open ? Number((((price - open) / open) * 100).toFixed(3)) : null,
    source: "okx",
    observedAt: new Date().toISOString(),
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  const q = (req && req.query) || {}
  const instId = String(q.instId || q.topic || "BTC-USDC").toUpperCase()
  let market = null
  let marketError = null
  try { market = await fetchMarket(instId) } catch (e) { marketError = String((e && e.message) || e) }
  if (!market || market.price == null) {
    return res.status(200).json({
      ok: false, version: "council-2", instId,
      reason: "market_unavailable", marketError, synthetic: false,
    })
  }
  const out = await runCouncil({ topic: instId, market })
  return res.status(200).json(Object.assign(
    { instId, market, generatedAt: new Date().toISOString() },
    out,
  ))
}
