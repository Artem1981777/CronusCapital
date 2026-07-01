import { useEffect, useState } from "react"
import type { CSSProperties } from "react"

type CalBin = { range: string; count: number; mean_predicted: number | null; empirical_accuracy: number | null }
type BacktestResp = { ok: boolean; open_positions?: number; resolved_positions?: number; brier?: number | null; skill_score?: number | null; base_rate?: number | null; accuracy?: number | null; calibration_bins?: CalBin[]; honesty_note?: string }
type TraceListResp = { ok: boolean; count?: number; recent?: string[] }
type TraceVerifyResp = { ok: boolean; hash?: string; verified?: boolean; recomputedHash?: string; archivedAt?: string }

const short = (h: string) => (h && h.length > 18 ? h.slice(0, 12) + "\u2026" + h.slice(-6) : h)

const S: Record<string, CSSProperties> = {
  wrap: { margin: "16px 0", padding: 16, border: "1px solid rgba(120,200,140,0.3)", borderRadius: 12, background: "rgba(20,28,24,0.6)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 },
  title: { fontSize: 14, fontWeight: 800, letterSpacing: 0.5, color: "#e6f5ec" },
  meta: { fontSize: 11, color: "#9ca3af" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 },
  card: { padding: 12, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, background: "rgba(255,255,255,0.02)" },
  label: { fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#9ca3af" },
  big: { fontSize: 22, fontWeight: 800, color: "#39d98a", marginTop: 2 },
  unit: { fontSize: 12, color: "#9ca3af", fontWeight: 500 },
  badge: { display: "inline-block", fontSize: 10, padding: "2px 6px", borderRadius: 6, border: "1px solid rgba(120,200,140,0.4)", color: "#bfe9cb", marginLeft: 8 },
  row: { display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  note: { fontSize: 11, color: "#9ca3af", lineHeight: 1.5, marginTop: 8 },
  err: { fontSize: 11, color: "#f0a0a0", marginTop: 8 },
  mono: { fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#bfe9cb" },
}

export default function ProofPanel() {
  const [bt, setBt] = useState<BacktestResp | null>(null)
  const [tr, setTr] = useState<TraceVerifyResp | null>(null)
  const [trCount, setTrCount] = useState<number | null>(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch("/api/backtest")
        const j = (await r.json()) as BacktestResp
        if (!alive) return
        setBt(j)
      } catch (e) { if (alive) setErr(String((e as Error).message || e)) }
      try {
        const r2 = await fetch("/api/trace")
        const j2 = (await r2.json()) as TraceListResp
        if (!alive) return
        setTrCount(typeof j2.count === "number" ? j2.count : 0)
        const first = j2.recent && j2.recent.length ? j2.recent[0] : ""
        if (first) {
          const r3 = await fetch("/api/trace?hash=" + encodeURIComponent(first))
          const j3 = (await r3.json()) as TraceVerifyResp
          if (!alive) return
          setTr(j3)
        }
      } catch (e) { if (alive) setErr(String((e as Error).message || e)) }
    }
    load()
    return () => { alive = false }
  }, [])

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <span style={S.title}>Proof \u2014 honest, verifiable signal</span>
        <span style={S.meta}>backtest \u00b7 content-addressed traces</span>
      </div>
      <div style={S.grid}>
        <div style={S.card}>
          <div style={S.label}>Signal backtest (Brier)</div>
          <div style={S.big}>{bt && bt.brier != null ? bt.brier.toFixed(4) : "\u2014"}<span style={S.unit}> lower = sharper</span></div>
          <div style={S.row}><span>Resolved stakes</span><span>{bt && bt.resolved_positions != null ? bt.resolved_positions : 0}</span></div>
          <div style={S.row}><span>Open stakes</span><span>{bt && bt.open_positions != null ? bt.open_positions : 0}</span></div>
          <div style={S.row}><span>Skill vs base rate</span><span>{bt && bt.skill_score != null ? bt.skill_score.toFixed(3) : "n/a"}</span></div>
          <div style={S.row}><span>Accuracy</span><span>{bt && bt.accuracy != null ? (bt.accuracy * 100).toFixed(0) + "%" : "n/a"}</span></div>
        </div>
        <div style={S.card}>
          <div style={S.label}>Content-addressed reasoning{tr && tr.verified ? <span style={S.badge}>VERIFIED</span> : null}</div>
          <div style={S.big}>{trCount != null ? trCount : 0}<span style={S.unit}> traces archived</span></div>
          <div style={S.row}><span>Latest hash</span><span style={S.mono}>{tr && tr.hash ? short(tr.hash) : "\u2014"}</span></div>
          <div style={S.row}><span>Re-hash matches</span><span>{tr ? (tr.verified ? "yes" : "no") : "\u2014"}</span></div>
          <div style={S.row}><span>Archived</span><span>{tr && tr.archivedAt ? tr.archivedAt.slice(0, 19).replace("T", " ") : "\u2014"}</span></div>
        </div>
      </div>
      <div style={S.note}>Brier and calibration score only Cronus own on-chain-resolved stakes (p = conviction committed before the outcome, o = on-chain resolution). Every reasoning trace is addressed by the sha256 of its canonical input+output; re-hashing the stored record reproduces the address, so tampering is detectable. Nothing is backfilled or simulated.</div>
      {err ? <div style={S.err}>{err}</div> : null}
    </div>
  )
}
