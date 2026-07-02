import { useEffect, useState } from "react"

type Market = {
  fearGreed: { value: number; classification: string } | null
  btcDominance: number | null
  totalMarketCapUsd: number | null
  marketCapChange24h: number | null
  sources?: { fearGreed?: string; market?: string }
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
      try {
        const r = await fetch("/api/market")
        if (!r.ok) throw new Error("bad status")
        const j = (await r.json()) as Market
        if (alive) { setData(j); setFailed(false) }
      } catch { if (alive) setFailed(true) } finally { if (alive) setLoading(false) }
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
