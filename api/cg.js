// Cached CoinGecko proxy — kills client-side 429s by sharing one upstream call across all clients
export default async function handler(req, res) {
  const path = (req.query.path || "").toString()
  if (!/^(coins\/[a-z0-9-]+\/(ohlc|market_chart)|simple\/price)/.test(path)) {
    res.status(400).json({ error: "path not allowed" })
    return
  }
  const url = "https://api.coingecko.com/api/v3/" + path
  try {
    const r = await fetch(url, { headers: { accept: "application/json" } })
    const body = await r.text()
    if (!r.ok) {
      res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=120")
      res.status(r.status).send(body)
      return
    }
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300")
    res.setHeader("Content-Type", "application/json")
    res.status(200).send(body)
  } catch (e) {
    res.status(502).json({ error: "upstream" })
  }
}
