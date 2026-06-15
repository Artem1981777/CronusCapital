import { useEffect, useState } from "react"
import type { CSSProperties } from "react"

function readEarn(): { calls: number; usd: number } {
	try { const r = JSON.parse(localStorage.getItem("cronus_earnings") || ""); return { calls: Number(r.calls) || 0, usd: Number(r.usd) || 0 } } catch { return { calls: 0, usd: 0 } }
}
function readSpend(): { count: number; usd: number } {
	try { const r = JSON.parse(localStorage.getItem("cronus.spend.v1") || ""); return { count: Number(r.count) || 0, usd: Number(r.usd) || 0 } } catch { return { count: 0, usd: 0 } }
}
function readSettlements(): number {
	try { const r = JSON.parse(localStorage.getItem("cronus_decisions") || ""); return Array.isArray(r) ? r.length : 0 } catch { return 0 }
}
function fmtUsd(n: number): string {
	const s = (Math.round(Math.abs(n) * 100) / 100).toFixed(2)
	return (n < 0 ? "-$" : "$") + s
}

const wrap: CSSProperties = { margin: "0 0 16px", border: "1px solid #c9a84c44", borderRadius: "12px", background: "radial-gradient(circle at 50% 0%, #0d160d, #070b07 70%)", overflow: "hidden", fontFamily: "Cinzel, serif" }
const head: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #c9a84c22" }
const headTitle: CSSProperties = { fontSize: "12px", letterSpacing: "2px", color: "#c9a84c" }
const liveWrap: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "10px", letterSpacing: "1px", color: "#39e014" }
const dot: CSSProperties = { width: "8px", height: "8px", borderRadius: "50%", background: "#39e014", animation: "cronusFlow 1.6s ease-in-out infinite" }
const row: CSSProperties = { display: "flex", alignItems: "stretch", justifyContent: "space-between", gap: "6px", padding: "16px 12px" }
const node: CSSProperties = { flex: "1 1 0", textAlign: "center", border: "1px solid #39e01433", borderRadius: "10px", padding: "12px 6px", background: "#0a0f0a" }
const nodeLabel: CSSProperties = { fontSize: "10px", letterSpacing: "1px", color: "#c9a84c", marginBottom: "6px" }
const nodeVal: CSSProperties = { fontSize: "18px", color: "#39e014", fontWeight: 600 }
const nodeSub: CSSProperties = { fontSize: "9px", color: "#6b7a5a", marginTop: "3px" }
const arrow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", color: "#39e014", minWidth: "16px" }
const foot: CSSProperties = { padding: "8px 14px", fontSize: "10px", color: "#9a8a5a", borderTop: "1px solid #c9a84c11", lineHeight: 1.5, textAlign: "center" }

export default function EconomicLoop() {
	const [earn, setEarn] = useState({ calls: 0, usd: 0 })
	const [spend, setSpend] = useState({ count: 0, usd: 0 })
	const [settlements, setSettlements] = useState(0)

	useEffect(() => {
		const tick = () => { setEarn(readEarn()); setSpend(readSpend()); setSettlements(readSettlements()) }
		tick()
		const id = setInterval(tick, 2500)
		return () => clearInterval(id)
	}, [])

	const net = earn.usd - spend.usd
	const a1: CSSProperties = { ...arrow, animation: "cronusFlow 2.4s ease-in-out infinite", animationDelay: "0s" }
	const a2: CSSProperties = { ...arrow, animation: "cronusFlow 2.4s ease-in-out infinite", animationDelay: "0.6s" }
	const a3: CSSProperties = { ...arrow, animation: "cronusFlow 2.4s ease-in-out infinite", animationDelay: "1.2s" }

	return (
		<div style={wrap}>
			<style>{"@keyframes cronusFlow { 0% { opacity: 0.15 } 50% { opacity: 1 } 100% { opacity: 0.15 } }"}</style>
			<div style={head}>
				<span style={headTitle}>{"\u{13080} THE AUTONOMOUS ECONOMIC LOOP"}</span>
				<span style={liveWrap}><span style={dot} /> LIVE</span>
			</div>
			<div style={row}>
				<div style={node}>
					<div style={nodeLabel}>EARN</div>
					<div style={nodeVal}>{fmtUsd(earn.usd)}</div>
					<div style={nodeSub}>{earn.calls} paid calls</div>
				</div>
				<div style={a1}>{"\u2192"}</div>
				<div style={node}>
					<div style={nodeLabel}>SPEND</div>
					<div style={nodeVal}>{fmtUsd(spend.usd)}</div>
					<div style={nodeSub}>{spend.count} inferences</div>
				</div>
				<div style={a2}>{"\u2192"}</div>
				<div style={node}>
					<div style={nodeLabel}>SETTLE</div>
					<div style={nodeVal}>{settlements}</div>
					<div style={nodeSub}>on-chain USDC</div>
				</div>
				<div style={a3}>{"\u2192"}</div>
				<div style={node}>
					<div style={nodeLabel}>REPORT</div>
					<div style={nodeVal}>{fmtUsd(net)}</div>
					<div style={nodeSub}>net flow</div>
				</div>
			</div>
			<div style={foot}>{"The only agent on Arc that runs a profitable, verifiable business \u2014 earn, spend on inference, settle on-chain, report."}</div>
		</div>
	)
}
