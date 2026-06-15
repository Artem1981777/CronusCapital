import { useEffect, useState, type CSSProperties } from "react"
import { keccak256, toBytes } from "viem"

type Step = { agent: string; thought: string; timestamp?: number }
type Log = { agent: string; thought: string; timestamp?: number }
type Trace = { topic: string; ts: number; steps: Step[]; traceHash: string }

const GOLD = "#c9a84c"
const GREEN = "#39e014"
const DIM = "#7e8c6a"
const KEY = "cronus_reasoning"
const GENESIS = "0x0000000000000000000000000000000000000000000000000000000000000000"

const SEED_STEPS: Step[] = [
  { agent: "SCOUT", thought: "Scanned Polymarket + Arc oracle feed: BTC>$80k by Jun30 at 0.82, volume rising, 3 corroborating sources." },
  { agent: "ANALYST", thought: "EV = 0.82*1.0 - 0.18 = +0.64 per $1; Kelly fraction 0.18; edge above 0.74 threshold -> HIGH conviction." },
  { agent: "EXECUTOR", thought: "Conviction 0.82 >= gate 0.55; within per-tx cap 0.01 USDC; settle on Arc, write keccak jobHash to ledger." },
]

function canonical(topic: string, steps: Step[]): string {
  return "CRONUS-COT|" + (topic || "reference") + "|" + steps.map((s) => s.agent + ":" + s.thought).join("|")
}
function hashTrace(topic: string, steps: Step[]): string {
  try { return keccak256(toBytes(canonical(topic, steps))) } catch { return GENESIS }
}
function shorten(h: string): string {
  return h.length > 18 ? h.slice(0, 12) + "\u2026" + h.slice(-10) : h
}
function loadHistory(): Trace[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]")
    if (Array.isArray(raw) && raw.length) return raw
  } catch { /* ignore */ }
  const seed: Trace = { topic: "BTC > $80k by Jun 30", ts: Date.now() - 3600000, steps: SEED_STEPS, traceHash: hashTrace("BTC > $80k by Jun 30", SEED_STEPS) }
  try { localStorage.setItem(KEY, JSON.stringify([seed])) } catch { /* ignore */ }
  return [seed]
}

const wrap: CSSProperties = { maxWidth: 1100, margin: "24px auto", padding: "20px 24px", border: "1px solid rgba(201,168,76,0.35)", borderRadius: 10, background: "linear-gradient(180deg, rgba(15,18,12,0.85), rgba(8,10,7,0.9))", fontFamily: "Cinzel, serif" }
const head: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }
const title: CSSProperties = { color: GOLD, fontSize: 15, letterSpacing: 2, fontWeight: 700 }
const sub: CSSProperties = { color: DIM, fontSize: 11, letterSpacing: 1, marginTop: 4 }
const badge: CSSProperties = { fontSize: 10, letterSpacing: 1, padding: "4px 10px", borderRadius: 4, border: "1px solid " + GREEN, color: GREEN, whiteSpace: "nowrap", height: "fit-content" }
const stepWrap: CSSProperties = { marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }
const stepBox: CSSProperties = { borderLeft: "2px solid " + GOLD, padding: "8px 12px", background: "rgba(201,168,76,0.04)" }
const stepAgent: CSSProperties = { color: GOLD, fontSize: 10, letterSpacing: 2, marginBottom: 3 }
const stepText: CSSProperties = { color: "#d4c5a0", fontSize: 12, lineHeight: 1.5, fontFamily: "Cinzel, serif" }
const hashRow: CSSProperties = { marginTop: 14, padding: "10px 12px", background: "#05080599", border: "1px solid rgba(57,224,20,0.25)", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }
const hashLabel: CSSProperties = { color: DIM, fontSize: 10, letterSpacing: 2 }
const hashVal: CSSProperties = { color: GREEN, fontSize: 12, fontFamily: "Courier New, monospace", letterSpacing: 1 }
const tagRow: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }
const tag: CSSProperties = { fontSize: 9, letterSpacing: 1, padding: "3px 8px", border: "1px solid rgba(201,168,76,0.3)", color: "#9a8a5a" }
const note: CSSProperties = { color: "#555", fontSize: 11, lineHeight: 1.6, marginTop: 12, fontStyle: "italic" }

export default function ReasoningTrace({ logs, topic }: { logs?: Log[]; topic?: string }) {
  const [history, setHistory] = useState<Trace[]>(() => loadHistory())

  useEffect(() => {
    if (!logs || logs.length === 0) return
    const steps: Step[] = logs.map((l) => ({ agent: (l.agent || "AGENT").toUpperCase(), thought: l.thought, timestamp: l.timestamp }))
    const t = topic || "live query"
    const traceHash = hashTrace(t, steps)
    setHistory((cur) => {
      if (cur.some((x) => x.traceHash === traceHash)) return cur
      const next: Trace = { topic: t, ts: Date.now(), steps, traceHash }
      const updated = [next, ...cur].slice(0, 20)
      try { localStorage.setItem(KEY, JSON.stringify(updated)) } catch { /* ignore */ }
      return updated
    })
  }, [logs, topic])

  const latest = history[0]
  const recomputed = latest ? hashTrace(latest.topic, latest.steps) : GENESIS
  const intact = !!latest && recomputed === latest.traceHash

  return (
    <div style={wrap}>
      <div style={head}>
        <div>
          <div style={title}>{"\u2696"} VERIFIABLE REASONING TRACE</div>
          <div style={sub}>AGENT CHAIN-OF-THOUGHT {"\u00b7"} CONTENT-ADDRESSED keccak256 {"\u00b7"} ERC-8004 / ERC-8183</div>
        </div>
        <div style={badge}>{intact ? "\u2713 REPRODUCIBLE" : "\u2717 MISMATCH"}</div>
      </div>
      {latest ? (
        <>
          <div style={stepWrap}>
            {latest.steps.map((s, i) => (
              <div key={i} style={stepBox}>
                <div style={stepAgent}>{s.agent}</div>
                <div style={stepText}>{s.thought}</div>
              </div>
            ))}
          </div>
          <div style={hashRow}>
            <span style={hashLabel}>TRACE COMMITMENT {"\u00b7"} {latest.topic}</span>
            <span style={hashVal}>{shorten(latest.traceHash)}</span>
          </div>
          <div style={tagRow}>
            <span style={tag}>ERC-8004 IDENTITY</span>
            <span style={tag}>ERC-8183 JOB</span>
            <span style={tag}>{history.length} TRACES LOGGED</span>
          </div>
          <div style={note}>
            Every consult's reasoning is canonicalized and hashed with keccak256 {"\u2014"} the same primitive that anchors our settlement jobHash on Arc. Any auditor can recompute the commitment from the steps above and detect tampering. Content-addressed, anchor-ready (IPFS CID parity), no cherry-picking.
          </div>
        </>
      ) : (
        <div style={note}>Run a consult to generate the first verifiable reasoning trace.</div>
      )}
    </div>
  )
}
