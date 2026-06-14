import { useEffect, useState } from "react"

const EXPLORER = "https://testnet.arcscan.app/tx/"

interface Decision { topic?: string; decision?: string; txHash?: string; timestamp?: number; agentId?: string }

function readDecisions(): Array<Decision> {
	try {
		const raw = JSON.parse(localStorage.getItem("cronus_decisions") || "[]")
		return Array.isArray(raw) ? raw : []
	} catch { return [] }
}

function ago(ts?: number): string {
	if (!ts) return ""
	const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
	if (s < 60) return s + "s ago"
	const m = Math.floor(s / 60)
	if (m < 60) return m + "m ago"
	const h = Math.floor(m / 60)
	if (h < 24) return h + "h ago"
	return Math.floor(h / 24) + "d ago"
}

function shorten(h: string): string {
	return h.length > 18 ? h.slice(0, 10) + "\u2026" + h.slice(-8) : h
}

export function LiveSettlements() {
	const [rows, setRows] = useState<Array<Decision>>(readDecisions())
	useEffect(() => {
		const id = setInterval(() => setRows(readDecisions()), 2000)
		return () => clearInterval(id)
	}, [])

	const settled = rows.filter((r) => r && r.txHash).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))

	return (
		<section className="cd-feed-wrap">
			<div className="cd-feed-head">
				<span className="cd-feed-title">\u26A1 Live On-chain Settlements</span>
				<span className="cd-feed-meta">{settled.length} settled \u00B7 {rows.length} decisions \u00B7 Arc Testnet</span>
			</div>
			{settled.length === 0 ? (
				<div className="cd-feed-empty">No settlements yet \u2014 run FORCE EXECUTE to post a real 0.01 USDC settlement on-chain.</div>
			) : (
				<ol className="cd-feed-list">
					{settled.slice(0, 12).map((r, i) => (
						<li key={(r.txHash || "") + i} className="cd-feed-row">
							<span className="cd-feed-idx">#{settled.length - i}</span>
							<span className="cd-feed-main">
								<span className="cd-feed-topic">{r.topic || "Market signal"}</span>
								<span className="cd-feed-sub">{r.decision || "EXECUTE"} \u00B7 {ago(r.timestamp)}{r.agentId ? " \u00B7 " + r.agentId : ""}</span>
							</span>
							<a className="cd-feed-tx" href={EXPLORER + r.txHash} target="_blank" rel="noreferrer">{shorten(r.txHash || "")} \u2197</a>
						</li>
					))}
				</ol>
			)}
		</section>
	)
}
