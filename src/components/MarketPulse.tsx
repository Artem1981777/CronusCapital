import { useEffect, useState } from "react"

type Market = {
  fearGreed: { value: number; classification: string } | null
  btcDominance: number | null
  totalMarketCapUsd: number | null
  marketCapChange24h: number | null
}

function fmtUsd(n: number | null): string {
  if (n == null || !isFinite(n)) return "n/a"
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T"
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B"
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M"
  return "$" + n.toFixed(0)
}
function fngColor(v: number): string {
  if (v >= 75) return "#39e014"
  if (v >= 55) return "#8fe04a"
  if (v >= 45) return "#c9a84c"
  if (v >= 25) return "#e0a014"
  return "#e05414"
}

export function MarketPulse() {
  const [data, setData] = useState<Market | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    async function load() {
      const next: Market = { fearGreed: null, btcDominance: null, totalMarketCapUsd: null, marketCapChange24h: null }
      let failedAny = false
      try {
        const r = await fetch("https://api.alternative.me/fng/?limit=1")
        if (!r.ok) throw new Error("fng")
        const j = (await r.json()) as { data?: Array<{ value?: string | number; value_classification?: string }> }
        const d = j.data && j.data[0]
        if (d && d.value != null) next.fearGreed = { value: Number(d.value), classification: String(d.value_classification || "") }
      } catch { failedAny = true }
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/global")
        if (!r.ok) throw new Error("global")
        const j = (await r.json()) as { data?: { market_cap_percentage?: Record<string, number>; total_market_cap?: Record<string, number>; market_cap_change_percentage_24h_usd?: number } }
        const g = j.data
        if (g) {
          if (g.market_cap_percentage && g.market_cap_percentage.btc != null) next.btcDominance = Number(g.market_cap_percentage.btc)
          if (g.total_market_cap && g.total_market_cap.usd != null) next.totalMarketCapUsd = Number(g.total_market_cap.usd)
          if (g.market_cap_change_percentage_24h_usd != null) next.marketCapChange24h = Number(g.market_cap_change_percentage_24h_usd)
        }
      } catch { failedAny = true }
      if (alive) { setData(next); setFailed(failedAny); setLoading(false) }
    }
    load()
    const id = setInterval(load, 120000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const fg = data ? data.fearGreed : null
  const chg = data ? data.marketCapChange24h : null
  return (
    <div className="cd-marketpulse">
      <div className="cd-mp-head">
        <span className="cd-mp-title">⬡ MARKET PULSE</span>
        <span className="cd-mp-src">live · alternative.me · coingecko{failed ? " · degraded" : ""}</span>
      </div>
      <div className="cd-mp-grid">
        <div className="cd-mp-cell">
          <div className="cd-mp-label">FEAR &amp; GREED</div>
          <div className="cd-mp-value" style={fg ? { color: fngColor(fg.value) } : undefined}>{loading ? "…" : fg ? String(fg.value) : "n/a"}</div>
          <div className="cd-mp-sub">{fg ? fg.classification : "—"}</div>
        </div>
        <div className="cd-mp-cell">
          <div className="cd-mp-label">BTC DOMINANCE</div>
          <div className="cd-mp-value">{loading ? "…" : data && data.btcDominance != null ? data.btcDominance.toFixed(1) + "%" : "n/a"}</div>
          <div className="cd-mp-sub">share of total cap</div>
        </div>
        <div className="cd-mp-cell">
          <div className="cd-mp-label">TOTAL MARKET CAP</div>
          <div className="cd-mp-value">{loading ? "…" : fmtUsd(data ? data.totalMarketCapUsd : null)}</div>
          <div className="cd-mp-sub" style={chg != null ? { color: chg >= 0 ? "#39e014" : "#e05414" } : undefined}>{chg != null ? (chg >= 0 ? "+" : "") + chg.toFixed(2) + "% 24h" : "24h change n/a"}</div>
        </div>
      </div>
    </div>
  )
}
