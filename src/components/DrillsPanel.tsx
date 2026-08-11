import { useEffect, useState } from "react"

type Inv = { name: string; holds: boolean | null; detail?: string }
type Scenario = { id: string; expect: string; why?: string; outcome?: string; txHash?: string; explorer?: string | null; reason?: string }
type Run = { finishedAt?: string; scenarios?: Scenario[]; note?: string }
type Loss = { immediateUsdc: number | null; perRolling24hUsdc: number | null; absoluteCeilingPerDayUsdc: number | null; perTransactionUsdc: number | null; windowResetsInSeconds: number | null; recipientConstraint?: string; assumption?: string; excluded?: string; formula?: string; spentInWindowUsdc?: number | null }
type Drills = { status?: string; staleAfterSeconds?: number; lastRunAt?: string | null; ageSeconds?: number | null; fresh?: boolean | null; runCount?: number; storage?: string; scenariosExpected?: Scenario[]; runs?: Run[]; note?: string }
type Resp = { ok: boolean; generatedAt?: string; guard?: { address?: string; explorer?: string; paused?: boolean | null }; boundedLoss?: Loss; drills?: Drills; invariants?: Inv[]; unread?: Array<{ field: string; reason: string }>; complete?: boolean; honesty?: string }

const S: Record<string, React.CSSProperties> = {
  wrap: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 16, background: "rgba(10,12,18,0.6)", marginTop: 16 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 },
  title: { fontSize: 13, fontWeight: 700, letterSpacing: 0.6 },
  chip: { fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)" },
  sub: { fontSize: 11, color: "#94a3b8", marginTop: 4 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 12 },
  cell: { padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" },
  big: { fontSize: 20, fontWeight: 700 },
  cap: { fontSize: 10, color: "#94a3b8", letterSpacing: 0.5, textTransform: "uppercase" },
  note: { fontSize: 11, color: "#94a3b8", lineHeight: 1.55, marginTop: 10 },
  row: { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  link: { color: "#7dd3fc" },
  err: { fontSize: 11, color: "#f0a0a0", marginTop: 8 },
}

const dot = (v: boolean | null | undefined) => (v === true ? "#4ade80" : v === false ? "#f87171" : "#94a3b8")
const mark = (v: boolean | null | undefined) => (v === true ? "\u25cf" : v === false ? "\u25cf" : "\u25cb")
const money = (v: number | null | undefined) => (v === null || v === undefined ? "unknown" : v + " USDC")

export default function DrillsPanel() {
  const [data, setData] = useState<Resp | null>(null)
  const [err, setErr] = useState<string>("")

  useEffect(() => {
    let dead = false
    fetch("/api/drills")
      .then((r) => r.json())
      .then((j) => { if (!dead) setData(j) })
      .catch((e) => { if (!dead) setErr(String(e && e.message ? e.message : e)) })
    return () => { dead = true }
  }, [])

  const d = data?.drills
  const loss = data?.boundedLoss
  const invs = data?.invariants || []
  const scenarios = (d?.runs && d.runs.length > 0 && d.runs[0].scenarios && d.runs[0].scenarios.length > 0) ? d.runs[0].scenarios : (d?.scenariosExpected || [])
  const status = d?.status || (data ? "unknown" : "loading")
  const chipColor = status === "fresh" ? "#4ade80" : status === "stale" ? "#fbbf24" : "#94a3b8"

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <div>
          <div style={S.title}>FIRE DRILLS {"\u00b7"} IS THE CONTAINMENT STILL FIRING?</div>
          <div style={S.sub}>Configuration proves the guard is wired correctly. It does not prove it still fires. This runs the attack for real against the live contract and publishes what came back.</div>
        </div>
        <div style={{ ...S.chip, color: chipColor, borderColor: chipColor }}>{status === "never_run" ? "never exercised" : status}</div>
      </div>

      <div style={S.grid}>
        <div style={S.cell}><div style={S.cap}>Worst case right now</div><div style={S.big}>{money(loss?.immediateUsdc)}</div></div>
        <div style={S.cell}><div style={S.cap}>Per rolling 24h</div><div style={S.big}>{money(loss?.perRolling24hUsdc)}</div></div>
        <div style={S.cell}><div style={S.cap}>Immutable ceiling</div><div style={S.big}>{money(loss?.absoluteCeilingPerDayUsdc)}</div></div>
        <div style={S.cell}><div style={S.cap}>Last exercise</div><div style={S.big}>{d?.lastRunAt ? Math.round((d.ageSeconds || 0) / 3600) + "h ago" : "never"}</div></div>
      </div>

      {loss?.formula ? <div style={S.note}><b>How the worst case is derived:</b> {loss.formula}. {loss.assumption ? "Assumption: " + loss.assumption + "." : null} {loss.recipientConstraint}</div> : null}
      {loss?.excluded ? <div style={S.note}>{loss.excluded}</div> : null}

      <div style={{ marginTop: 14 }}>
        {invs.map((x) => (
          <div key={x.name} style={S.row}>
            <span style={{ color: dot(x.holds) }}>{mark(x.holds)}</span>
            <span style={{ flex: 1 }}>{x.name}{x.detail ? <span style={{ color: "#94a3b8" }}> {"\u2014"} {x.detail}</span> : null}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={S.cap}>Scenarios</div>
        {scenarios.map((s) => (
          <div key={s.id} style={S.row}>
            <span style={{ color: s.outcome ? (s.outcome === "reverted" || s.outcome === "succeeded" ? "#4ade80" : "#f87171") : "#94a3b8" }}>{s.outcome ? "\u25cf" : "\u25cb"}</span>
            <span style={{ flex: 1 }}>
              {s.id} {"\u00b7"} expected {s.expect}{s.outcome ? " \u2192 " + s.outcome : " \u00b7 not exercised yet"}
              {s.why ? <div style={{ color: "#94a3b8", fontSize: 11 }}>{s.why}</div> : null}
              {s.explorer ? <a style={S.link} href={s.explorer} target="_blank" rel="noreferrer">tx {"\u2197"}</a> : null}
            </span>
          </div>
        ))}
      </div>

      {d?.note ? <div style={S.note}>{d.note}</div> : null}
      {data?.honesty ? <div style={S.note}>{data.honesty}</div> : null}
      <div style={S.note}>Reproduce without keys: <a style={S.link} href="/api/drills" target="_blank" rel="noreferrer">/api/drills {"\u2197"}</a></div>
      {err ? <div style={S.err}>drill state unavailable: {err}</div> : null}
    </div>
  )
}
