import { useEffect, useState } from "react"

type Snap = { ts: number; nav: number }
type Resp = { ok?: boolean; count?: number; snapshots?: Snap[]; note?: string; degraded?: boolean }

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const p2 = (n: number) => (n < 10 ? "0" + n : "" + n)
  return p2(d.getUTCMonth() + 1) + "/" + p2(d.getUTCDate()) + " " + p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes())
}

export function VaultNavHistory() {
  const [snaps, setSnaps] = useState<Snap[]>([])
  const [note, setNote] = useState("")
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const r = await fetch("/api/info?kind=vault-nav")
        if (!r.ok) throw new Error("nav")
        const j = (await r.json()) as Resp
        if (alive) {
          setSnaps(Array.isArray(j.snapshots) ? j.snapshots : [])
          setNote(typeof j.note === "string" ? j.note : "")
          setFailed(false)
        }
      } catch {
        if (alive) setFailed(true)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    const id = window.setInterval(load, 60000)
    return () => { alive = false; window.clearInterval(id) }
  }, [])

  const pts = snaps.slice().sort((a, b) => a.ts - b.ts)
  const n = pts.length
  const navs = pts.map((p) => p.nav)
  const maxNav = navs.reduce((m, v) => (v > m ? v : m), 0)
  const minNav = navs.reduce((m, v) => (v < m ? v : m), navs.length ? navs[0] : 0)
  const first = n ? pts[0] : null
  const last = n ? pts[n - 1] : null
  const change = first && last && first.nav > 0 ? ((last.nav - first.nav) / first.nav) * 100 : 0

  const W = 300
  const H = 60
  const span = maxNav - minNav
  const usd = (v: number) => "$" + v.toFixed(2)
  const pct = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%"

  const coords = pts.map((p, i) => {
    const x = n > 1 ? (i / (n - 1)) * W : 0
    const y = span > 0 ? H - 4 - ((p.nav - minNav) / span) * (H - 8) : H / 2
    return x.toFixed(1) + "," + y.toFixed(1)
  })
  const line = coords.join(" ")

  return (
    <div className="cd-nav">
      <div className="cd-nav-head">
        <span className="cd-nav-title">◈ VAULT NAV · LIVE</span>
        <span className="cd-nav-src">on-chain totalAssets(){failed ? " · degraded" : ""}</span>
      </div>
      {loading && !n ? (
        <div className="cd-nav-note">Loading…</div>
      ) : n < 2 ? (
        <div className="cd-nav-note">Recording live NAV from on-chain readings — {n} point so far. The curve fills over time and is never backfilled.</div>
      ) : (
        <>
          <div className="cd-nav-stats">
            <div className="cd-nav-stat"><span className="cd-nav-k">current</span><span className="cd-nav-v">{usd(last ? last.nav : 0)}</span></div>
            <div className="cd-nav-stat"><span className="cd-nav-k">since start</span><span className="cd-nav-v">{pct(change)}</span></div>
            <div className="cd-nav-stat"><span className="cd-nav-k">points</span><span className="cd-nav-v">{n}</span></div>
          </div>
          <svg className="cd-nav-svg" viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none">
            <polyline className="cd-nav-line" points={line} />
          </svg>
          <div className="cd-nav-axis"><span>{first ? fmtTime(first.ts) : ""}</span><span>{last ? fmtTime(last.ts) : ""}</span></div>
        </>
      )}
      <div className="cd-nav-note">{note || "Live on-chain NAV readings, recorded from deploy onward. Yield accruals are self-funded testnet demo, not external trading profit."}</div>
    </div>
  )
}
