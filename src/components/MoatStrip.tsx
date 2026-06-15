import { useEffect, useState } from "react"
import type { CSSProperties } from "react"

function readEarn(): { calls: number; usd: number } {
	try {
		const r = JSON.parse(localStorage.getItem("cronus_earnings") || "")
		return { calls: Number(r.calls) || 0, usd: Number(r.usd) || 0 }
	} catch {
		return { calls: 0, usd: 0 }
	}
}
function readSpend(): { count: number; usd: number } {
	try {
		const r = JSON.parse(localStorage.getItem("cronus.spend.v1") || "")
		return { count: Number(r.count) || 0, usd: Number(r.usd) || 0 }
	} catch {
		return { count: 0, usd: 0 }
	}
}
function readSettlements(): number {
	try {
		const r = JSON.parse(localStorage.getItem("cronus_decisions") || "")
		return Array.isArray(r) ? r.length : 0
	} catch {
		return 0
	}
}
function fmtUsd(n: number): string {
	const s = (Math.round(Math.abs(n) * 100) / 100).toFixed(2)
	return (n < 0 ? "-$" : "$") + s
}

const wrap: CSSProperties = { margin: "0 0 14px", border: "1px solid #c9a84c33", borderRadius: "10px", background: "#070b07", overflow: "hidden", fontFamily: "Cinzel, serif" }
const head: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "linear-gradient(90deg,#0c140c,#0a0f0a)", borderBottom: "1px solid #c9a84c22" }
const title: CSSProperties = { fontSize: "11px", letterSpacing: "1px", color: "#c9a84c" }
const tag: CSSProperties = { fontSize: "9px", letterSpacing: "1px", color: "#070b07", background: "#c9a84c", borderRadius: "4px", padding: "2px 7px" }
const grid: CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap", padding: "12px" }
const tile: CSSProperties = { flex: "1 1 90px", minWidth: "90px", border: "1px solid #39e01422", borderRadius: "8px", padding: "8px 10px", background: "#0a0f0a" }
const tileLabel: CSSProperties = { fontSize: "9px", letterSpacing: "1px", color: "#7e8c6a", marginBottom: "4px" }
const tileVal: CSSProperties = { fontSize: "16px", color: "#39e014", fontWeight: 600 }
const tileSub: CSSProperties = { fontSize: "9px", color: "#6b7a5a", marginTop: "2px" }
const foot: CSSProperties = { padding: "8px 12px", fontSize: "10px", color: "#9a8a5a", borderTop: "1px solid #c9a84c11", lineHeight: 1.5 }

export default function MoatStrip() {
	const [earn, setEarn] = useState({ calls: 0, usd: 0 })
	const [spend, setSpend] = useState({ count: 0, usd: 0 })
	const [settlements, setSettlements] = useState(0)

	useEffect(() => {
		const tick = () => {
			setEarn(readEarn())
			setSpend(readSpend())
			setSettlements(readSettlements())
		}
		tick()
		const id = setInterval(tick, 3000)
		return () => clearInterval(id)
	}, [])

	const net = earn.usd - spend.usd
	const margin = earn.usd > 0 ? (net / earn.usd) * 100 : 0
	const netVal: CSSProperties = { ...tileVal, color: net >= 0 ? "#39e014" : "#e0143c" }

	return (
		<div style={wrap}>
			<div style={head}>
				<span style={title}>{"\u{13080} AUTONOMOUS P&L \u00b7 SELF-SUSTAINING AGENT"}</span>
				<span style={tag}>MOAT</span>
			</div>
			<div style={grid}>
				<div style={tile}>
					<div style={tileLabel}>NET FLOW</div>
					<div style={netVal}>{fmtUsd(net)}</div>
					<div style={tileSub}>{"earn \u2212 spend"}</div>
				</div>
				<div style={tile}>
					<div style={tileLabel}>MARGIN</div>
					<div style={tileVal}>{margin.toFixed(1)}%</div>
					<div style={tileSub}>gross</div>
				</div>
				<div style={tile}>
					<div style={tileLabel}>REVENUE</div>
					<div style={tileVal}>{fmtUsd(earn.usd)}</div>
					<div style={tileSub}>{earn.calls} paid calls</div>
				</div>
				<div style={tile}>
					<div style={tileLabel}>COST</div>
					<div style={tileVal}>{fmtUsd(spend.usd)}</div>
					<div style={tileSub}>{spend.count} inferences</div>
				</div>
				<div style={tile}>
					<div style={tileLabel}>SETTLEMENTS</div>
					<div style={tileVal}>{settlements}</div>
					<div style={tileSub}>on-chain USDC</div>
				</div>
			</div>
			<div style={foot}>{"Settlement: real on-chain USDC on Arc testnet \u00b7 Identity & reputation: ERC-8004 \u00b7 Job settlement: ERC-8183 \u00b7 Caps: $0.01/tx \u00b7 $5.00/day"}</div>
		</div>
	)
}
