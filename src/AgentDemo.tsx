import type { CSSProperties } from "react"

const GOLD = "#c9a84c"
const GREEN = "#39e014"
const DIM = "#7e8c6a"
const PM = "https://polymarket.com"

const tag: CSSProperties = { color: DIM, fontSize: 9, letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" }
const row: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 6, borderLeft: "2px solid rgba(57,224,20,0.4)", background: "rgba(57,224,20,0.04)" }
const rightCol: CSSProperties = { textAlign: "right" }
const qStyle: CSSProperties = { color: "#d4c5a0", fontSize: 12, lineHeight: 1.4 }
const linkStyle: CSSProperties = { color: GREEN, fontSize: 10, textDecoration: "none", letterSpacing: 1 }
const sideStyle: CSSProperties = { color: GOLD, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }
const probStyle: CSSProperties = { color: GREEN, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }
const metaStyle: CSSProperties = { color: DIM, fontSize: 10, marginTop: 2 }
const decRow: CSSProperties = { padding: "10px 12px", marginBottom: 6, borderLeft: "2px solid " + GOLD, background: "rgba(201,168,76,0.04)" }
const decHead: CSSProperties = { color: GOLD, fontSize: 9, letterSpacing: 2, marginBottom: 3 }
const decBody: CSSProperties = { color: "#d4c5a0", fontSize: 12, lineHeight: 1.5 }
const convStyle = (c: string): CSSProperties => ({ color: c === "HIGH" ? GREEN : GOLD, fontSize: 10, fontWeight: 700 })

const signals = [
	{ q: "BTC closes above $80k by Jun 30", side: "YES", prob: 82 },
	{ q: "Fed cuts rates at July FOMC", side: "NO", prob: 61 },
	{ q: "US recession declared in 2026", side: "NO", prob: 71 },
	{ q: "ETH above $4k during June", side: "YES", prob: 47 },
	{ q: "SOL reclaims $200 this month", side: "YES", prob: 38 },
]

const opportunities = [
	{ m: "BTC > $80k", edge: 7.4, ev: 0.12, kelly: 0.18, conv: "HIGH" },
	{ m: "Recession 2026 — fade", edge: 5.8, ev: 0.09, kelly: 0.12, conv: "MED" },
	{ m: "Fed cut July — fade", edge: 4.1, ev: 0.06, kelly: 0.09, conv: "MED" },
]

const decisions = [
	"LONG · BTC>$80k · 0.18u · conf 0.82 · settle 0.01 USDC",
	"FADE · Fed-cut-July · 0.09u · conf 0.61",
	"HOLD · ETH>$4k · below conviction gate (0.47 < 0.55)",
]

export function AgentDemoScout() {
	return (
		<div>
			<div style={tag}>{"\u00b7"} live agora scan {"\u00b7"} polymarket {"\u00b7"} sample feed</div>
			{signals.map((s, i) => (
				<div key={i} style={row}>
					<div>
						<div style={qStyle}>{s.q}</div>
						<a href={PM} target="_blank" rel="noreferrer" style={linkStyle}>{"\u2197"} polymarket.com</a>
					</div>
					<div style={rightCol}>
						<div style={probStyle}>{s.prob}%</div>
						<div style={sideStyle}>{s.side}</div>
					</div>
				</div>
			))}
		</div>
	)
}

export function AgentDemoAnalyst() {
	return (
		<div>
			<div style={tag}>{"\u00b7"} expected-value ranking {"\u00b7"} kelly-sized {"\u00b7"} sample</div>
			{opportunities.map((o, i) => (
				<div key={i} style={row}>
					<div>
						<div style={qStyle}>{o.m}</div>
						<div style={metaStyle}>edge {o.edge}% {"\u00b7"} EV {o.ev} {"\u00b7"} Kelly {o.kelly}u</div>
					</div>
					<div style={convStyle(o.conv)}>{o.conv}</div>
				</div>
			))}
		</div>
	)
}

export function AgentDemoExecutor() {
	return (
		<div>
			<div style={tag}>{"\u00b7"} autonomous decisions {"\u00b7"} guardrail-gated {"\u00b7"} sample</div>
			{decisions.map((d, i) => (
				<div key={i} style={decRow}>
					<div style={decHead}>DECISION {i + 1}</div>
					<div style={decBody}>{d}</div>
				</div>
			))}
		</div>
	)
}
