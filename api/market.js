// api/market.js — read-only market pulse proxy. Fail-open (always 200), no secrets, no auth.
async function getJson(url, ms) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms || 4000)
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } })
    if (!r.ok) return null
    return await r.json()
  } catch { return null } finally { clearTimeout(t) }
}
export default async function handler(req, res) {
  const [fng, global] = await Promise.all([
    getJson("https://api.alternative.me/fng/?limit=1"),
    getJson("https://api.coingecko.com/api/v3/global"),
  ])
  let fearGreed = null
  try {
    const d = fng && fng.data && fng.data[0]
    if (d && d.value != null) fearGreed = { value: Number(d.value), classification: String(d.value_classification || "") }
  } catch { fearGreed = null }
  let btcDominance = null, totalMarketCapUsd = null, marketCapChange24h = null
  try {
    const g = global && global.data
    if (g) {
      if (g.market_cap_percentage && g.market_cap_percentage.btc != null) btcDominance = Number(g.market_cap_percentage.btc)
      if (g.total_market_cap && g.total_market_cap.usd != null) totalMarketCapUsd = Number(g.total_market_cap.usd)
      if (g.market_cap_change_percentage_24h_usd != null) marketCapChange24h = Number(g.market_cap_change_percentage_24h_usd)
    }
  } catch { /* ignore */ }
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300")
  res.status(200).json({
    fearGreed, btcDominance, totalMarketCapUsd, marketCapChange24h,
    sources: { fearGreed: "alternative.me", market: "coingecko.com" },
    ts: Date.now(),
  })
}
