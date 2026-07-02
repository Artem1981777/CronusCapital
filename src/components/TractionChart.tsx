import { useEffect, useState } from "react"

type Receipt = { amountUsdc?: number; settledAt?: string }
type ReceiptsResp = { receipts?: Receipt[]; count?: number; totalUsdc?: number }
type Traction = { external_payers?: number }
type Pt = { x: number; y: number }

const W = 600, H = 150

export function TractionChart() {
  const [points, setPoints] = useState<Pt[] | null>(null)
  const [meta, setMeta] = useState<{ count: number; total: number } | null>(null)
  const [ext, setExt] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      let anyFail = false
      try {
        const r = await fetch("/api/receipts")
        if (!r.ok) throw new Error("receipts")
        const j = (await r.json()) as ReceiptsResp
        const rec = (j.receipts || []).filter(x => x.settledAt && typeof x.amountUsdc === "number")
        rec.sort((a, b) => Date.parse(a.settledAt as string) - Date.parse(b.settledAt as string))
        if (rec.length >= 2) {
          const t0 = Date.parse(rec[0].settledAt as string)
          const t1 = Date.parse(rec[rec.length - 1].settledAt as string)
          const span = (t1 - t0) || 1
          let cum = 0
          const cumVals = rec.map(x => { cum += (x.amountUsdc as number); return cum })
          const cumMax = cumVals[cumVals.length - 1] || 1
          const pts = rec.map((x, i) => {
            const t = Date.parse(x.settledAt as string)
            return { x: ((t - t0) / span) * W, y: H - (cumVals[i] / cumMax) * H }
          })
          if (alive) setPoints(pts)
        } else if (alive) { setPoints([]) }
        if (alive) setMeta({ count: j.count != null ? j.count : rec.length, total: j.totalUsdc != null ? j.totalUsdc : 0 })
      } catch { anyFail = true }
      try {
        const r = await fetch("/api/traction")
        if (!r.ok) throw new Error("traction")
        const j = (await r.json()) as Traction
        if (alive) setExt(j.external_payers != null ? j.external_payers : null)
      } catch { anyFail = true }
      if (alive) { setFailed(anyFail); setLoading(false) }
    }
    load()
    const id = setInterval(load, 120000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const line = points && points.length >= 2 ? points.map(p => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ") : ""
  const area = line ? "0," + H + " " + line + " " + W + "," + H : ""

  return (
    <div className="cd-trac">
      <div className="cd-trac-head">
        <span className="cd-trac-title">▲ SETTLED USDC · CUMULATIVE</span>
        <span className="cd-trac-src">live · /api/receipts{failed ? " · degraded" : ""}</span>
      </div>
      {loading && !points ? (
        <div className="cd-trac-note">Loading…</div>
      ) : !line ? (
        <div className="cd-trac-note">Not enough settled receipts to chart yet (n/a).</div>
      ) : (
        <svg className="cd-trac-svg" viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none">
          <polygon points={area} fill="rgba(201,168,76,0.14)" stroke="none" />
          <polyline points={line} fill="none" stroke="#f0d27a" strokeWidth="2" />
        </svg>
      )}
      <div className="cd-trac-stats">
        <div className="cd-trac-stat"><span className="cd-trac-n">{meta ? meta.count : "—"}</span><span className="cd-trac-l">settlements</span></div>
        <div className="cd-trac-stat"><span className="cd-trac-n">{meta ? "$" + meta.total.toFixed(2) : "—"}</span><span className="cd-trac-l">total USDC</span></div>
        <div className="cd-trac-stat"><span className="cd-trac-n">{ext != null ? ext : "—"}</span><span className="cd-trac-l">external payers</span></div>
      </div>
      <div className="cd-trac-note">Honest: every settlement charted here is self-generated test traffic on Arc testnet — real end-to-end paywall settlement, not external demand. External payers = {ext != null ? ext : "n/a"}. Self-generated test volume is never counted as external.</div>
    </div>
  )
}
