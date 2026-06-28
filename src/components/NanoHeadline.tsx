import { useEffect, useState } from "react"
import type { CSSProperties } from "react"

type Nano = {
	total_calls?: number
	unique_external_payers?: number
	settlement_count?: number
	batch_ratio?: number
	nano_usdc?: number
	self_demo_calls?: number
}

const boxS: CSSProperties = { border: "1px solid #2dd4bf66", borderRadius: 10, padding: "10px 12px", margin: "0 0 12px", background: "linear-gradient(180deg,#08201c,#0a1513)" }
const h1S: CSSProperties = { fontWeight: 700, color: "#5eead4", fontSize: 14 }
const subS: CSSProperties = { color: "#9ca3af", fontSize: 11, margin: "4px 0 8px" }
const statsS: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "#e5e7eb" }
const honestS: CSSProperties = { color: "#fbbf24", fontSize: 11, marginTop: 6 }
const ctaS: CSSProperties = { color: "#9ca3af", fontSize: 11, marginTop: 4 }
const codeS: CSSProperties = { color: "#5eead4" }

export default function NanoHeadline() {
	const [n, setN] = useState<Nano | null>(null)
	useEffect(() => {
		let alive = true
		const load = async () => {
			try {
				const r = await fetch("/api/traction")
				const j = await r.json()
				if (alive && j && j.nano) setN(j.nano as Nano)
			} catch {
				/* ignore */
			}
		}
		load()
		const id = window.setInterval(load, 15000)
		return () => {
			alive = false
			window.clearInterval(id)
		}
	}, [])
	const calls = (n && n.total_calls) || 0
	const usdc = (n && n.nano_usdc) || 0
	const ext = (n && n.unique_external_payers) || 0
	const self = (n && n.self_demo_calls) || 0
	const ratio = (n && n.batch_ratio) || 0
	return (
		<div style={boxS}>
			<div style={h1S}>{"\u26A1 $0.001 NANO signal \u2014 gas-free via Circle Gateway"}</div>
			<div style={subS}>Sub-cent, EIP-3009, batched settlement. NANO is the core rail; PREMIUM ($0.02) below is the on-chain x402 tier.</div>
			<div style={statsS}>
				<span>{calls + " nano settlements"}</span>
				<span>{"\u00B7 " + usdc.toFixed(3) + " USDC"}</span>
				<span>{"\u00B7 batch " + ratio + ":1 (testnet 1:1)"}</span>
			</div>
			<div style={honestS}>{self + " self-demo (A2A, honestly labeled) \u00B7 " + ext + " external payers"}</div>
			<div style={ctaS}>Become a real external payer: <code style={codeS}>node scripts/buyer-agent.mjs --deposit 1</code></div>
		</div>
	)
}
