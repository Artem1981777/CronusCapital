import { useEffect, useState } from "react"

type Rec = { settledAt?: string; amountUsdc?: number }
type RCP = { count?: number; totalUsdc?: number; receipts?: Rec[] }
type Day = { day: string; vol: number; cnt: number }

function buildSeries(receipts: Rec[]): Day[] {
  const map: Record<string, Day> = {}
  for (const r of receipts) {
    if (!r || !r.settledAt) continue
    const day = String(r.settledAt).slice(0, 10)
    if (day.length !== 10) continue
    if (!map[day]) map[day] = { day, vol: 0, cnt: 0 }
    map[day].vol += Number(r.amountUsdc || 0)
    map[day].cnt += 1
  }
  const keys = Object.keys(map).sort()
  if (!keys.length) return []
  const out: Day[] = []
  const cur = new Date(keys[0] + "T00:00:00Z")
  const end = new Date(keys[keys.length - 1] + "T00:00:00Z")
  let guard = 0
  for (; cur <= end && guard < 180; cur.setUTCDate(cur.getUTCDate() + 1)) {
    const key = cur.toISOString().slice(0, 10)
    out.push(map[key] || { day: key, vol: 0, cnt: 0 })
    guard += 1
  }
  return out
}

export function PaymentsSeries() {
  const [data, setData] = useState<RCP | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const r = await fetch("/api/receipts")
        if (!r.ok) throw new Error("receipts")
        const j = (await r.json()) as RCP
        if (alive) { setData(j); setFailed(false) }
      } catch {
        if (alive) setFailed(true)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const receipts = data && Array.isArray(data.receipts) ? data.receipts : []
  const series = buildSeries(receipts)
  const maxVol = series.reduce((m, d) => (d.vol > m ? d.vol : m), 0)
  const totalUsdc = data && data.totalUsdc != null ? data.totalUsdc : series.reduce((s, d) => s + d.vol, 0)
  const totalPayments = data && data.count != null ? data.count : receipts.length
  const activeDays = series.filter((d) => d.vol > 0).length
  const busiest = series.reduce((b, d) => (d.vol > b.vol ? d : b), { day: "", vol: 0, cnt: 0 })
  const W = series.length > 0 ? series.length * 12 : 12
  const H = 44
  const usd = (n: number) => "$" + n.toFixed(2)

  return (
    <div className="cd-ps">
      <div className="cd-ps-head">
        <span className="cd-ps-title">◎ SETTLEMENT CADENCE · x402</span>
        <span className="cd-ps-src">live · /api/receipts{failed ? " · degraded" : ""}</span>
      </div>
      {loading && !data ? (
        <div className="cd-ps-note">Loading…</div>
      ) : series.length === 0 ? (
        <div className="cd-ps-note">No settled receipts yet.</div>
      ) : (
        <>
          <div className="cd-ps-stats">
            <div className="cd-ps-stat"><span className="cd-ps-k">payments</span><span className="cd-ps-v">{totalPayments}</span></div>
            <div className="cd-ps-stat"><span className="cd-ps-k">total</span><span className="cd-ps-v">{usd(totalUsdc)}</span></div>
            <div className="cd-ps-stat"><span className="cd-ps-k">active days</span><span className="cd-ps-v">{activeDays}</span></div>
            <div className="cd-ps-stat"><span className="cd-ps-k">busiest</span><span className="cd-ps-v">{busiest.day ? usd(busiest.vol) : "n/a"}</span></div>
          </div>
          <svg className="cd-ps-svg" viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none">
            {series.map((d, i) => {
              const h = maxVol > 0 ? (d.vol / maxVol) * (H - 8) : 0
              return <rect key={d.day} className={d.vol > 0 ? "cd-ps-bar" : "cd-ps-bar cd-ps-bar-0"} x={i * 12 + 2} y={H - h} width={8} height={h} rx={1} />
            })}
          </svg>
          <div className="cd-ps-axis"><span>{series[0].day}</span><span>{series[series.length - 1].day}</span></div>
          <div className="cd-ps-note">Per-day settled x402 volume, aggregated from {receipts.length} on-chain receipts. Self-generated test traffic — external payers remain 0.</div>
        </>
      )}
    </div>
  )
}
