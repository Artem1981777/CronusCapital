export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { endpoint, ...params } = req.query;
  
  const endpoints = {
    markets: "https://gamma-api.polymarket.com/markets",
    market: "https://gamma-api.polymarket.com/markets",
    prices: "https://clob.polymarket.com/prices",
    book: "https://clob.polymarket.com/book"
  }
  
  // Remove tag param — Polymarket tags are not reliable
  delete params.tag
  
  const base = endpoints[endpoint] || endpoints.markets
  const query = new URLSearchParams(params).toString()
  const url = query ? base + "?" + query : base

  try {
    const response = await fetch(url, {
      headers: { "Accept": "application/json" }
    })
    const data = await response.json()
    res.status(200).json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
