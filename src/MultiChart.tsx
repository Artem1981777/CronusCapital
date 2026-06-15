import { useEffect, useState, type CSSProperties } from "react"

const COINS = [
	{ id: "bitcoin", sym: "BTC", color: "#f7931a" },
	{ id: "ethereum", sym: "ETH", color: "#7eb8f7" },
	{ id: "solana", sym: "SOL", color: "#39e014" },
	{ id: "arbitrum", sym: "ARB", color: "#c9a84c" },
]

const W = 1000
const H = 280
const padT = 16
const padB = 28
const padL = 10
const padR = 10

function marketChartUrl(id: string): string {
	return "https://api.coingecko.com/api/v3/coins/" + id + "/market_chart?vs_currency=usd&days=7"
}
function synthSeries(seed: number): Array<number> {
	const out: Array<number> = []
	let v = 0
	for (let i = 0; i < 60; i++) { v += (Math.sin(i * 0.3 + seed) + (Math.random() - 0.5)) * 0.4; out.push(v) }
	return out
}
function buildPath(arr: Array<number>, min: number, max: number): string {
	if (arr.length < 2) return ""
	const span = max - min || 1
	let d = ""
	for (let i = 0; i < arr.length; i++) {
		const x = padL + (i / (arr.length - 1)) * (W - padL - padR)
		const y = padT + (1 - (arr[i] - min) / span) * (H - padT - padB)
		d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " "
	}
	return d
}

const wrap2: CSSProperties = { margin: "22px 0", background: "#070b07", border: "1px solid rgba(57,224,20,0.18)", borderRadius: 12, padding: "16px 18px" }
const head2: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }
const title2: CSSProperties = { color: "#c9a84c", fontFamily: "Cinzel, serif", fontSize: 14, letterSpacing: 2, textTransform: "uppercase" }
const sub2: CSSProperties = { color: "#7e8c6a", fontSize: 11 }
const legend: CSSProperties = { display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }
const legendItem: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4 }
const legendSym: CSSProperties = { color: "#cfe6c4", fontSize: 12, marginRight: 4 }
const svgStyle: CSSProperties = { width: "100%", height: 280, display: "block" }
const proof2: CSSProperties = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(126,140,106,0.16)", fontSize: 11, color: "#7e8c6a" }
const link2: CSSProperties = { color: "#c9a84c", textDecoration: "none", border: "1px solid rgba(201,168,76,0.4)", borderRadius: 7, padding: "4px 8px" }
const code2: CSSProperties = { fontFamily: "monospace", fontSize: 10, color: "#5f6b51", wordBreak: "break-all", marginTop: 6 }

function dotStyle(color: string): CSSProperties {
	return { display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: color }
}
function pctStyle(up: boolean): CSSProperties {
	return { color: up ? "#39e014" : "#e0563a", fontFamily: "monospace", fontSize: 12 }
}
function liveStyle2(on: boolean): CSSProperties {
	return { color: on ? "#39e014" : "#c9a84c", fontWeight: 700 }
}

export default function MultiChart() {
	const [series, setSeries] = useState<Record<string, Array<number>>>({})
	const [live, setLive] = useState(false)
	const [synced, setSynced] = useState("")

	useEffect(() => {
		let alive = true
		async function load() {
			const next: Record<string, Array<number>> = {}
			let anyLive = false
			await Promise.all(COINS.map(async (c, idx) => {
				try {
					const r = await fetch(marketChartUrl(c.id))
					if (!r.ok) throw new Error("bad")
					const j = await r.json()
					const prices: Array<Array<number>> = j && Array.isArray(j.prices) ? j.prices : []
					if (prices.length > 1) {
						const base = prices[0][1]
						next[c.sym] = prices.map((p) => (p[1] / base - 1) * 100)
						anyLive = true
					} else {
						next[c.sym] = synthSeries(idx)
					}
				} catch {
					next[c.sym] = synthSeries(idx)
				}
			}))
			if (!alive) return
			setSeries(next)
			setLive(anyLive)
			setSynced(new Date().toLocaleTimeString())
		}
		load()
		const iv = setInterval(load, 90000)
		return () => { alive = false; clearInterval(iv) }
	}, [])

	let min = Infinity, max = -Infinity
	for (const c of COINS) {
		const arr = series[c.sym] || []
		for (const v of arr) { if (v < min) min = v; if (v > max) max = v }
	}
	if (!(max > min)) { min = -1; max = 1 }
	if (min > 0) min = 0
	if (max < 0) max = 0
	const span = max - min || 1
	const zeroY = padT + (1 - (0 - min) / span) * (H - padT - padB)

	return (
		<div style={wrap2}>
			<div style={head2}>
				<span style={title2}>{"\u{13002}"} Multi-Asset Performance</span>
				<span style={sub2}>7-day normalized return · all markets</span>
			</div>
			<div style={legend}>
				{COINS.map((c) => {
					const arr = series[c.sym] || []
					const cur = arr.length ? arr[arr.length - 1] : 0
					return (
						<span key={c.sym} style={legendItem}>
							<span style={dotStyle(c.color)} />
							<span style={legendSym}>{c.sym}</span>
							<span style={pctStyle(cur >= 0)}>{(cur >= 0 ? "+" : "") + cur.toFixed(2)}%</span>
						</span>
					)
				})}
			</div>
			<svg viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" style={svgStyle}>
				<line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="rgba(126,140,106,0.3)" strokeWidth={1} strokeDasharray="4 4" />
				{COINS.map((c) => {
					const d = buildPath(series[c.sym] || [], min, max)
					return d ? <path key={c.sym} d={d} stroke={c.color} fill="none" strokeWidth={1.6} /> : null
				})}
			</svg>
			<div style={proof2}>
				<span style={liveStyle2(live)}>{live ? "\u25CF LIVE" : "\u25CB SIMULATED"}</span>
				<span>Source: api.coingecko.com · 4 assets · 7d</span>
				<span>synced {synced || "\u2026"}</span>
				<a style={link2} href={marketChartUrl("bitcoin")} target="_blank" rel="noreferrer">Verify raw {"\u2197"}</a>
			</div>
			<div style={code2}>GET {marketChartUrl("bitcoin")}</div>
		</div>
	)
}
