// lib/council/handler.js - HTTP entry point for the real council. ADDITIVE.
// Live OKX quotes (the same source api/consult.js uses) plus votes from real models.
// No keys => an honest refusal, not an invented consensus.
import { runCouncil } from "./council.js"

const OKX = "https://www.okx.com/api/v5/market/ticker?instId="
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null }

// fetchImpl is injectable => the function is testable offline
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
  const looksLikeInstrument = (s) => /^[a-z0-9]+-[a-z0-9]+(-[a-z0-9]+)?$/i.test(String(s || "").trim())
  const fallbackInst = String(process.env.CONSULT_DEFAULT_INST || "BTC-USDC")
  const instId = String(
    looksLikeInstrument(q.instId) ? q.instId
      : looksLikeInstrument(q.topic) ? q.topic
        : fallbackInst,
  ).toUpperCase()
  // Untrusted input never reaches the model. instId is validated by
  // looksLikeInstrument above; the prompt is built from that alone, so a query
  // string cannot carry instructions into the council.
  const rawTopic = String(q.topic || "").trim()
  const topicRejected = rawTopic !== "" && !looksLikeInstrument(rawTopic)
  const topic = instId
  let market = null
  let marketError = null
  try { market = await fetchMarket(instId) } catch (e) { marketError = String((e && e.message) || e) }
  if (!market || market.price == null) {
    return res.status(200).json({
      ok: false, version: "council-2", instId,
      reason: "market_unavailable", marketError, synthetic: false,
    })
  }
  const out = await runCouncil({ topic, market })
  return res.status(200).json(Object.assign(
    {
      instId,
      market,
      generatedAt: new Date().toISOString(),
      promptInput: {
        usedInPrompt: instId,
        rejectedFreeText: topicRejected,
        policy: "the model receives the validated instrument id only - free text from the query never reaches the prompt",
      },
    },
    out,
  ))
}
