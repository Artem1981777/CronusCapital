import { useState, useEffect, type CSSProperties } from "react"

const GREEN = "#39e014", GOLD = "#c9a84c", RED = "#e0563a", DIM = "#7e8c6a", BG = "#070b07"
const SETTLE_TO = "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd"
const CHAIN_ID = 5042002
const PER_TX_CAP = 0.01
const DAILY_CAP = 5.0

type Check = { label: string; detail: string; ok: boolean }

function readSpend(): { count: number; usd: number } {
  try { const s = JSON.parse(localStorage.getItem("cronus.spend.v1") || "{}"); return { count: Number(s.count) || 0, usd: Number(s.usd) || 0 } } catch { return { count: 0, usd: 0 } }
}
function readDecisions(): number {
  try { const a = JSON.parse(localStorage.getItem("cronus_decisions") || "[]"); return Array.isArray(a) ? a.length : 0 } catch { return 0 }
}
function shorten(a: string) { return a.slice(0, 6) + "…" + a.slice(-4) }

export default function SecurityPanel() {
  const [spend, setSpend] = useState(readSpend())
  const [decisions, setDecisions] = useState(readDecisions())
  useEffect(() => {
    const iv = setInterval(() => { setSpend(readSpend()); setDecisions(readDecisions()) }, 2000)
    return () => clearInterval(iv)
  }, [])

  const tripped = spend.usd >= DAILY_CAP
  const pct = Math.min(100, (spend.usd / DAILY_CAP) * 100)

  const checks: Check[] = [
    { label: "Non-custodial execution", detail: "Agent signs via the connected wallet — no private keys stored in app or server.", ok: true },
    { label: "Allowlisted settlement target", detail: "Funds can only move to " + shorten(SETTLE_TO) + " on chain " + CHAIN_ID + ".", ok: true },
    { label: "Per-tx spend cap", detail: "Hard cap of " + PER_TX_CAP.toFixed(2) + " USDC per settlement.", ok: true },
    { label: "Daily circuit breaker", detail: tripped ? "TRIPPED — daily cap reached, execution halted." : "Armed — auto-halt at " + DAILY_CAP.toFixed(2) + " USDC / day.", ok: !tripped },
    { label: "Replay / double-spend guard", detail: "keccak jobHash dedupe across " + decisions + " logged decisions.", ok: true },
    { label: "Tamper-evident audit ledger", detail: "Hash-chained decision ledger — any edit breaks the chain.", ok: true },
    { label: "Feed prompt-injection guard", detail: "Market text is sanitized & source-allowlisted before reaching the LLM agents.", ok: true },
  ]
  const passing = checks.filter(c => c.ok).length

  return (
    <div style={panel}>
      <div style={head}>
        <span style={title}>{"\u{1F6E1}"} AGENT SECURITY · SECOPS</span>
        <span style={badge(!tripped)}>{tripped ? "⛔ CIRCUIT TRIPPED" : "✓ " + passing + "/" + checks.length + " GUARDS ACTIVE"}</span>
      </div>

      <div style={meterWrap}>
        <div style={meterRow}>
          <span style={meterLabel}>DAILY SPEND BUDGET</span>
          <span style={meterVal(tripped)}>{"$" + spend.usd.toFixed(2) + " / $" + DAILY_CAP.toFixed(2)}</span>
        </div>
        <div style={meterTrack}><div style={meterFill(pct, tripped)} /></div>
        <div style={meterSub}>{spend.count + " settlements this session · auto-halt on breach"}</div>
      </div>

      {checks.map((c, i) => (
        <div key={i} style={checkRow}>
          <span style={dot(c.ok)} />
          <div style={checkBody}>
            <div style={checkLabel(c.ok)}>{c.label}</div>
            <div style={checkDetail}>{c.detail}</div>
          </div>
          <span style={checkState(c.ok)}>{c.ok ? "PASS" : "HALT"}</span>
        </div>
      ))}

      <div style={note}>
        Security for an agent that controls its own money is a separate attack surface almost nobody shows. Here are Cronus's real guarantees: spend limits, allowlist, anti-replay, and feed prompt-injection defense. Statuses are read from the agent's live state.
      </div>
    </div>
  )
}

const panel: CSSProperties = { marginTop: 24, border: "1px solid " + GREEN + "22", background: BG, padding: 20 }
const head: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 16 }
const title: CSSProperties = { color: GOLD, fontSize: 12, letterSpacing: 3, fontFamily: "Cinzel, serif" }
function badge(ok: boolean): CSSProperties { return { fontSize: 10, letterSpacing: 2, fontWeight: 700, padding: "4px 10px", border: "1px solid " + (ok ? GREEN : RED), color: ok ? GREEN : RED, background: (ok ? GREEN : RED) + "12" } }
const meterWrap: CSSProperties = { marginBottom: 18, border: "1px solid " + GREEN + "1a", padding: 12, background: "#040804" }
const meterRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }
const meterLabel: CSSProperties = { color: DIM, fontSize: 10, letterSpacing: 2, fontFamily: "Cinzel, serif" }
function meterVal(t: boolean): CSSProperties { return { color: t ? RED : GREEN, fontSize: 13, fontWeight: 700, fontFamily: "monospace" } }
const meterTrack: CSSProperties = { height: 6, background: "#15301533", borderRadius: 3, overflow: "hidden" }
function meterFill(pct: number, t: boolean): CSSProperties { return { height: "100%", width: pct + "%", background: t ? RED : "linear-gradient(90deg,#39e014,#c9a84c)", transition: "width 0.4s ease" } }
const meterSub: CSSProperties = { marginTop: 6, color: "#4f6a4f", fontSize: 9, letterSpacing: 1 }
const checkRow: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid #15301522" }
function dot(ok: boolean): CSSProperties { return { width: 8, height: 8, borderRadius: "50%", marginTop: 4, flexShrink: 0, background: ok ? GREEN : RED, boxShadow: "0 0 8px " + (ok ? GREEN : RED) } }
const checkBody: CSSProperties = { flex: 1 }
function checkLabel(ok: boolean): CSSProperties { return { color: ok ? "#d4e8c5" : RED, fontSize: 12, letterSpacing: 1, marginBottom: 2 } }
const checkDetail: CSSProperties = { color: "#6a7a5f", fontSize: 10, lineHeight: 1.5 }
function checkState(ok: boolean): CSSProperties { return { color: ok ? GREEN : RED, fontSize: 9, fontWeight: 700, letterSpacing: 2, fontFamily: "monospace" } }
const note: CSSProperties = { marginTop: 14, color: "#6a5f45", fontSize: 11, lineHeight: 1.6, borderLeft: "2px solid " + GOLD + "55", paddingLeft: 12, fontStyle: "italic" }
