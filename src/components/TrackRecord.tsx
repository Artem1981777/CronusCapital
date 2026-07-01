import { useState, useEffect, type CSSProperties } from "react"

const GREEN = "#39e014", GOLD = "#c9a84c", DIM = "#7e8c6a", BG = "#070b07", RED = "#d4543a"

type Pos = {
  id?: string
  marketId?: string
  verdict?: string
  conviction?: number
  stakeUsdc?: number
  status?: string
  openTxExplorer?: string
  resolveTxExplorer?: string
}
type TR = {
  ok?: boolean
  open_positions?: number
  resolved_positions?: number
  accuracy?: number
  total_staked_usdc?: number
  total_slashed_usdc?: number
  total_returned_usdc?: number
  realized_pnl_usdc?: number
  positions?: Pos[]
}
type BT = { ok?: boolean; brier?: number | null; skill_score?: number | null }

const num = (v: unknown, d = 0): number => (typeof v === "number" && isFinite(v) ? v : d)

export default function TrackRecord() {
  const [tr, setTr] = useState<TR | null>(null)
  const [bt, setBt] = useState<BT | null>(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch("/api/track-record")
        const j = (await r.json()) as TR
        if (alive) setTr(j)
      } catch (e) { if (alive) setErr(String((e as Error).message || e)) }
      try {
        const r2 = await fetch("/api/backtest")
        const j2 = (await r2.json()) as BT
        if (alive) setBt(j2)
      } catch { /* backtest optional */ }
    }
    load()
    const iv = setInterval(load, 15000)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  const positions = (tr && Array.isArray(tr.positions)) ? tr.positions : []
  const resolvedList = positions.filter(p => p.status === "correct" || p.status === "wrong")
  const resolved = tr && tr.resolved_positions != null ? tr.resolved_positions : resolvedList.length
  const open = tr && tr.open_positions != null ? tr.open_positions : positions.filter(p => p.status === "open").length
  const correct = resolvedList.filter(p => p.status === "correct").length
  const accuracy = tr && tr.accuracy != null ? tr.accuracy * 100 : (resolved ? (correct / resolved) * 100 : 0)
  const avgConf = resolvedList.length ? (resolvedList.reduce((a, p) => a + num(p.conviction), 0) / resolvedList.length) * 100 : 0
  const staked = num(tr && tr.total_staked_usdc)
  const slashed = num(tr && tr.total_slashed_usdc)
  const pnl = num(tr && tr.realized_pnl_usdc)
  const brier = bt && bt.brier != null ? bt.brier : null

  const gap = accuracy - avgConf
  let calib = "CALIBRATED", calibColor: string = GREEN
  if (resolved === 0) { calib = "NO RESOLVED CALLS"; calibColor = DIM }
  else if (gap < -8) { calib = "OVERCONFIDENT"; calibColor = RED }
  else if (gap > 8) { calib = "UNDERCONFIDENT"; calibColor = GOLD }

  const fmtUsd = (v: number) => (v < 0 ? "-" : "") + "$" + Math.abs(v).toFixed(3)

  return (
    <div style={panel}>
      <div style={head}>
        <span style={title}>ORACLE TRACK RECORD {"\u00B7"} ON-CHAIN, SELF-SCORED</span>
        <span style={badge(calibColor)}>{calib}</span>
      </div>
      <div style={grid}>
        <Stat k="RESOLVED" v={String(resolved)} sub={open + " open"} big />
        <Stat k="ACCURACY" v={accuracy.toFixed(0) + "%"} sub={correct + "/" + resolved + " correct"} />
        <Stat k="BRIER SCORE" v={brier != null ? brier.toFixed(3) : "\u2014"} sub="lower is better" />
        <Stat k="STAKED" v={"$" + staked.toFixed(3)} sub="real USDC at stake" />
        <Stat k="REALIZED P&L" v={fmtUsd(pnl)} sub={"$" + slashed.toFixed(3) + " slashed"} accent />
      </div>
      <div style={barWrap}>
        <Bar label="Conviction" pct={avgConf} color={GOLD} />
        <Bar label="Accuracy" pct={accuracy} color={GREEN} />
      </div>
      <div style={listHead}>RESOLVED CALLS {"\u00B7"} click to verify on Arc</div>
      <div style={list}>
        {resolvedList.length === 0 ? (
          <div style={emptyRow}>No resolved positions yet. This feed starts empty and is never seeded {"\u2014"} it fills only as real on-chain stakes resolve.</div>
        ) : resolvedList.slice(0, 8).map((c, i) => {
          const ok = c.status === "correct"
          const link = c.resolveTxExplorer || c.openTxExplorer || ""
          const body = (
            <>
              <span style={mark(ok)}>{ok ? "\u2713" : "\u2717"}</span>
              <span style={topicCol}>{(c.marketId || "position") + " " + (c.verdict || "")}</span>
              <span style={confCol}>{(num(c.conviction) * 100).toFixed(0) + "%"}</span>
              <span style={stakeCol}>{"$" + num(c.stakeUsdc).toFixed(3)}</span>
            </>
          )
          return link
            ? <a key={i} href={link} target="_blank" rel="noreferrer" style={rowLink}>{body}</a>
            : <div key={i} style={row}>{body}</div>
        })}
      </div>
      <div style={note}>
        Every position is committed on-chain (keccak256) BEFORE the outcome is known, then resolved verifiably:
        correct {"\u2192"} stake returned, wrong {"\u2192"} stake slashed to a burn address. Accuracy, Brier and P&L
        are derived only from real on-chain-resolved stakes {"\u2014"} nothing is seeded, backfilled or cherry-picked.
        {err ? " (" + err + ")" : ""}
      </div>
    </div>
  )
}

function Stat({ k, v, sub, big, accent }: { k: string; v: string; sub: string; big?: boolean; accent?: boolean }) {
  return (
    <div style={cell}>
      <div style={cellKey}>{k}</div>
      <div style={cellVal(!!big, !!accent)}>{v}</div>
      <div style={cellSub}>{sub}</div>
    </div>
  )
}

function Bar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const fill: CSSProperties = { height: "100%", width: Math.max(0, Math.min(100, pct)) + "%", background: color, transition: "width .4s" }
  return (
    <div style={barRow}>
      <span style={barLabel}>{label}</span>
      <div style={barTrack}><div style={fill} /></div>
      <span style={barPct}>{pct.toFixed(0) + "%"}</span>
    </div>
  )
}

const panel: CSSProperties = { marginTop: 14, border: "1px solid " + GREEN + "33", background: BG, padding: 18 }
const head: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }
const title: CSSProperties = { color: GOLD, fontSize: 12, letterSpacing: 3, fontFamily: "Cinzel, serif" }
function badge(c: string): CSSProperties { return { fontSize: 10, fontWeight: 700, letterSpacing: 2, color: c, border: "1px solid " + c + "66", padding: "3px 9px" } }
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 14 }
const cell: CSSProperties = { border: "1px solid " + GREEN + "22", background: "#040804", padding: "12px 14px" }
const cellKey: CSSProperties = { color: DIM, fontSize: 9, letterSpacing: 2, marginBottom: 6, fontFamily: "Cinzel, serif" }
function cellVal(big: boolean, accent: boolean): CSSProperties { return { color: accent ? GOLD : GREEN, fontSize: big ? 26 : 18, fontWeight: 700, fontFamily: "monospace" } }
const cellSub: CSSProperties = { color: DIM, fontSize: 9, marginTop: 4 }
const barWrap: CSSProperties = { marginBottom: 14 }
const barRow: CSSProperties = { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }
const barLabel: CSSProperties = { color: DIM, fontSize: 10, width: 72, letterSpacing: 1 }
const barTrack: CSSProperties = { flex: 1, height: 8, background: "#0c140c", border: "1px solid " + GREEN + "1a" }
const barPct: CSSProperties = { color: "#d4e8c5", fontSize: 11, fontFamily: "monospace", width: 40, textAlign: "right" }
const listHead: CSSProperties = { color: DIM, fontSize: 9, letterSpacing: 2, margin: "4px 0 6px", fontFamily: "Cinzel, serif" }
const list: CSSProperties = { border: "1px solid " + GREEN + "1a", background: "#040804", padding: 6 }
const rowBase: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "5px 8px", borderBottom: "1px solid #15301518", fontSize: 11 }
const row: CSSProperties = { ...rowBase }
const rowLink: CSSProperties = { ...rowBase, textDecoration: "none", cursor: "pointer" }
const emptyRow: CSSProperties = { color: DIM, fontSize: 11, padding: "10px 8px", lineHeight: 1.6, fontStyle: "italic" }
function mark(ok: boolean): CSSProperties { return { color: ok ? GREEN : RED, fontWeight: 700, width: 14 } }
const topicCol: CSSProperties = { color: "#d4e8c5", flex: 1, fontFamily: "monospace" }
const confCol: CSSProperties = { color: GOLD, fontFamily: "monospace" }
const stakeCol: CSSProperties = { color: DIM, fontFamily: "monospace", width: 56, textAlign: "right" }
const note: CSSProperties = { marginTop: 12, color: "#6a5f45", fontSize: 11, lineHeight: 1.6, borderLeft: "2px solid " + GOLD + "55", paddingLeft: 12, fontStyle: "italic" }
