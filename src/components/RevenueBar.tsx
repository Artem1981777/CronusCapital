import { useState, useEffect } from "react"

interface Decision { timestamp: number }

export function RevenueBar() {
	const [rev, setRev] = useState({ usd: 0, calls: 0 })
	const [spent, setSpent] = useState({ usd: 0, count: 0 })
	const [settles, setSettles] = useState(0)
	const [tph, setTph] = useState(0)

	useEffect(() => {
		const read = () => {
			try {
				const e = JSON.parse(localStorage.getItem("cronus_earnings") || '{"calls":0,"usd":0}')
				setRev({ usd: Number(e.usd) || 0, calls: Number(e.calls) || 0 })
				const s = JSON.parse(localStorage.getItem("cronus.spend.v1") || "{}")
				setSpent({ usd: Number(s.usd) || 0, count: Number(s.count) || 0 })
				const d: Decision[] = JSON.parse(localStorage.getItem("cronus_decisions") || "[]")
				setSettles(Array.isArray(d) ? d.length : 0)
				const now = Date.now()
				setTph(d.filter((x) => x && now - Number(x.timestamp) < 3600000).length)
			} catch { /* ignore */ }
		}
		read()
		const t = setInterval(read, 2000)
		return () => clearInterval(t)
	}, [])

	const avg = rev.calls > 0 ? rev.usd / rev.calls : 0
	const net = rev.usd - spent.usd
	const cells = [
		{ k: "REVENUE", v: "$" + rev.usd.toFixed(2), s: "USDC earned" },
		{ k: "PAID REQUESTS", v: String(rev.calls), s: "x402 unlocks" },
		{ k: "AVG / CALL", v: "$" + avg.toFixed(3), s: "per request" },
		{ k: "SETTLEMENTS", v: String(settles), s: "on-chain" },
		{ k: "AGENT SPEND", v: "$" + spent.usd.toFixed(2), s: spent.count + " calls out" },
		{ k: "NET FLOW", v: (net >= 0 ? "+$" : "-$") + Math.abs(net).toFixed(2), s: "rev - cost" },
	]

	return (
		<div className="cd-rev">
			<div className="cd-rev-head">
				<span className="cd-rev-title">⬡ REVENUE · RFB 02</span>
				<span className="cd-rev-tph">{tph} tx / hr</span>
			</div>
			<div className="cd-rev-grid">
				{cells.map((c) => (
					<div className="cd-rev-cell" key={c.k}>
						<div className="cd-rev-v">{c.v}</div>
						<div className="cd-rev-k">{c.k}</div>
						<div className="cd-rev-s">{c.s}</div>
					</div>
				))}
			</div>
		</div>
	)
}
