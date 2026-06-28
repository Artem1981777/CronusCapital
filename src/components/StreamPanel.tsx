import { useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"

const boxS: CSSProperties = { border: "1px solid #8b5cf655", borderRadius: 10, padding: "10px 12px", margin: "0 0 12px", background: "linear-gradient(180deg,#160a20,#0d0814)" }
const h1S: CSSProperties = { fontWeight: 700, color: "#c4b5fd", fontSize: 14 }
const subS: CSSProperties = { color: "#9ca3af", fontSize: 11, margin: "4px 0 8px" }
const gridS: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "#e5e7eb", margin: "6px 0", alignItems: "center" }
const numS: CSSProperties = { fontWeight: 700, color: "#a78bfa" }
const inputS: CSSProperties = { width: 70, marginLeft: 6, background: "#0b0712", color: "#e5e7eb", border: "1px solid #8b5cf655", borderRadius: 6, padding: "2px 6px" }
const noteS: CSSProperties = { color: "#fbbf24", fontSize: 10, marginTop: 6 }

const USD_PER_SEC = 0.001

export default function StreamPanel() {
	const [on, setOn] = useState(false)
	const [secs, setSecs] = useState(0)
	const [signals, setSignals] = useState(0)
	const [spent, setSpent] = useState(0)
	const [verdict, setVerdict] = useState("\u2014")
	const [budget, setBudget] = useState("0.05")
	const timer = useRef<number | null>(null)
	const stop = () => {
		if (timer.current) {
			window.clearInterval(timer.current)
			timer.current = null
		}
		setOn(false)
	}
	useEffect(() => () => {
		if (timer.current) window.clearInterval(timer.current)
	}, [])
	const start = () => {
		if (on) {
			stop()
			return
		}
		setOn(true)
		setSecs(0)
		setSignals(0)
		setSpent(0)
		setVerdict("\u2026")
		const cap = Number(budget) || 0.05
		let s = 0
		let sp = 0
		let sig = 0
		timer.current = window.setInterval(async () => {
			s += 1
			sp = Number((s * USD_PER_SEC).toFixed(6))
			setSecs(s)
			setSpent(sp)
			try {
				const r = await fetch("/api/stream?topic=" + encodeURIComponent("BTC-USDC momentum"))
				const j = await r.json()
				if (j && j.ok) {
					sig += 1
					setSignals(sig)
					if (j.frame && j.frame.verdict) setVerdict(String(j.frame.verdict) + " (" + Number(j.frame.conviction || 0) + ")")
				}
			} catch {
				/* ignore */
			}
			if (sp >= cap) stop()
		}, 1000)
	}
	return (
		<div style={boxS}>
			<div style={h1S}>{"\u25B6 STREAM SIGNALS \u2014 pay-per-second nano stream"}</div>
			<div style={subS}>{"Stream value at the smallest scale: " + USD_PER_SEC + " USDC/sec via Circle Gateway until budget runs out."}</div>
			<div style={gridS}>
				<span>{"seconds "}<span style={numS}>{secs}</span></span>
				<span>{"USDC/sec "}<span style={numS}>{USD_PER_SEC}</span></span>
				<span>{"spent "}<span style={numS}>{spent.toFixed(3)}</span></span>
				<span>{"signals "}<span style={numS}>{signals}</span></span>
				<span>{"last "}<span style={numS}>{verdict}</span></span>
			</div>
			<div style={gridS}>
				<label style={subS}>{"budget USDC"}<input type="number" min="0.001" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} style={inputS} /></label>
				<button className="cd-btn cd-btn-primary" onClick={start}>{on ? "STOP STREAM" : "START STREAM"}</button>
			</div>
			<div style={noteS}>Live visualization of stream economics. Real per-second on-chain micropayments are executed by the autonomous buyer-agent (--stream); UI burn is projected at the same rate.</div>
		</div>
	)
}
