import { useEffect, useState } from "react"

type Coin = {
  id: string
  symbol: string
  current_price: number
  price_change_percentage_24h: number | null
  sparkline_in_7d?: { price?: number[] }
}

const IDS = ["bitcoin", "ethereum", "solana", "arbitrum"]
const LABEL: Record<string, string> = { bitcoin: "BTC", ethereum: "ETH", solana: "SOL", arbitrum: "ARB" }

function spark(prices: number[]): string {
  if (!prices || prices.length < 2) return ""
  const W = 120, H = 30
  let min = Infinity, max = -Infinity
  for (const p of prices) { if (p < min) min = p; if (p > max) max = p }
  const span = max - min || 1
  const n = prices.length
  return prices.map((p, i) => {
    const x = (i / (n - 1)) * W
    const y = H - ((p - min) / span) * H
    return x.toFixed(1) + "," + y.toFixed(1)
  }).join(" ")
}

function fmtPrice(n: number): string {
  if (!isFinite(n)) return "n/a"
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })
  if (n >= 1) return "$" + n.toFixed(2)
  return "$" + n.toFixed(4)
}

export function MarketTickers() {
  const [coins, setCoins] = useState<Coin[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=" + IDS.join(",") + "&price_change_percentage=24h&sparkline=true")
        if (!r.ok) throw new Error("markets")
        const j = (await r.json()) as Coin[]
        if (alive) { setCoins(Array.isArray(j) ? j : null); setFailed(false); setLoading(false) }
      } catch { if (alive) { setFailed(true); setLoading(false) } }
    }
    load()
    const id = setInterval(load, 120000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const ordered = coins ? IDS.map(id => coins.find(c => c.id === id)).filter((c): c is Coin => !!c) : []

  return (
    <div className="cd-tickers">
      <div className="cd-tk-head">
        <span className="cd-tk-title">◇ TICKERS · 7D</span>
        <span className="cd-tk-src">live · coingecko{failed ? " · degraded" : ""}</span>
      </div>
      <div className="cd-tk-grid">
        {loading && !coins ? (
          <div className="cd-tk-note">Loading…</div>
        ) : ordered.length === 0 ? (
          <div className="cd-tk-note">Market data unavailable (n/a).</div>
        ) : ordered.map(c => {
          const chg = c.price_change_percentage_24h
          const up = chg != null && chg >= 0
          const color = up ? "#39e014" : "#e05414"
          const chgStyle = { color }
          const pts = spark((c.sparkline_in_7d && c.sparkline_in_7d.price) || [])
          return (
            <div className="cd-tk-cell" key={c.id}>
              <div className="cd-tk-row">
                <span className="cd-tk-sym">{LABEL[c.id] || c.symbol.toUpperCase()}</span>
                <span className="cd-tk-chg" style={chgStyle}>{chg != null ? (up ? "+" : "") + chg.toFixed(2) + "%" : "n/a"}</span>
              </div>
              <svg className="cd-tk-spark" viewBox="0 0 120 30" preserveAspectRatio="none">
                {pts ? <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" /> : null}
              </svg>
              <div className="cd-tk-price">{fmtPrice(c.current_price)}</div>
            </div>
          )
        })}
      </div>
      <div className="cd-tk-foot">Read-only. 7-day price sparklines and 24h change from the CoinGecko public API; illustrative market context, not trading signals.</div>
    </div>
  )
}
