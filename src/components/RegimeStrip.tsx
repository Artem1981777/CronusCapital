import { useEffect, useState } from "react"

type CG = { id?: string; price_change_percentage_24h?: number | null; sparkline_in_7d?: { price?: number[] } }
type FG = { value: number; classification: string } | null

const GREEN = "#39e014", GOLD = "#c9a84c", RED = "#e0563a"

function pct(cur: number | null): string { return cur == null ? "n/a" : (cur >= 0 ? "+" : "") + cur.toFixed(2) + "%" }
function chgStyle(v: number | null) { return { color: v == null ? "#7e8c6a" : v >= 0 ? GREEN : RED } }
function badgeStyle(color: string) { return { color, borderColor: color } }

export function RegimeStrip() {
  const [btc24h, setBtc24h] = useState<number | null>(null)
  const [btc7d, setBtc7d] = useState<number | null>(null)
  const [fg, setFg] = useState<FG>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      let failedAny = false
      let v24: number | null = null, v7: number | null = null
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin&price_change_percentage=24h&sparkline=true")
        if (!r.ok) throw new Error("markets")
        const j = (await r.json()) as CG[]
        const b = Array.isArray(j) && j.length ? j[0] : null
        if (b) {
          if (b.price_change_percentage_24h != null) v24 = Number(b.price_change_percentage_24h)
          const sp = b.sparkline_in_7d && b.sparkline_in_7d.price ? b.sparkline_in_7d.price : []
          if (sp.length > 1) {
            const first = sp[0], last = sp[sp.length - 1]
            if (first) v7 = ((last - first) / first) * 100
          }
        }
      } catch { failedAny = true }
      let fng: FG = null
      try {
        const r = await fetch("https://api.alternative.me/fng/?limit=1")
        if (!r.ok) throw new Error("fng")
        const j = (await r.json()) as { data?: Array<{ value?: string | number; value_classification?: string }> }
        const d = j.data && j.data[0]
        if (d && d.value != null) fng = { value: Number(d.value), classification: String(d.value_classification || "") }
      } catch { failedAny = true }
      if (alive) { setBtc24h(v24); setBtc7d(v7); setFg(fng); setFailed(failedAny); setLoading(false) }
    }
    load()
    const id = setInterval(load, 120000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  let label = "RANGE-BOUND · CHOP", color = GOLD
  if (btc7d != null && btc24h != null) {
    if (btc7d > 3 && btc24h > 0) { label = "UPTREND · RISK-ON"; color = GREEN }
    else if (btc7d < -3 && btc24h < 0) { label = "DOWNTREND · RISK-OFF"; color = RED }
  }
  const known = btc7d != null && btc24h != null

  return (
    <div className="cd-regime">
      <div className="cd-regime-head">
        <span className="cd-regime-title">◎ MARKET REGIME</span>
        <span className="cd-regime-src">derived · coingecko · alternative.me{failed ? " · degraded" : ""}</span>
      </div>
      <div className="cd-regime-row">
        <span className="cd-regime-badge" style={badgeStyle(known ? color : "#7e8c6a")}>{loading ? "…" : known ? label : "n/a"}</span>
        <div className="cd-regime-metrics">
          <div className="cd-regime-metric"><span className="cd-regime-k">BTC 24h</span><span className="cd-regime-v" style={chgStyle(btc24h)}>{pct(btc24h)}</span></div>
          <div className="cd-regime-metric"><span className="cd-regime-k">BTC 7d</span><span className="cd-regime-v" style={chgStyle(btc7d)}>{pct(btc7d)}</span></div>
          <div className="cd-regime-metric"><span className="cd-regime-k">Fear &amp; Greed</span><span className="cd-regime-v">{fg ? fg.value + " · " + fg.classification : "n/a"}</span></div>
        </div>
      </div>
      <div className="cd-regime-note">Derived from live market data (BTC 24h &amp; 7d change, Fear &amp; Greed), not a proprietary oracle. Thresholds: uptrend = 7d &gt; +3% and 24h &gt; 0; downtrend = 7d &lt; -3% and 24h &lt; 0; otherwise range-bound. Illustrative market context, not a trading signal.</div>
    </div>
  )
}
