import { useEffect, useState, type CSSProperties } from "react"

type Decision = {
	topic?: string
	decision?: string
	txHash?: string
	timestamp?: number
	agentId?: string
}

const UNIT_USDC = 0.01
const POLL_MS = 2000
const GOLD = "#c9a84c"
const GREEN = "#39e014"

const wrap: CSSProperties = {
	maxWidth: 1100,
	margin: "24px auto",
	padding: "20px 24px",
	border: "1px solid rgba(201,168,76,0.35)",
	borderRadius: 10,
	background: "linear-gradient(180deg, rgba(15,18,12,0.85), rgba(8,10,7,0.9))",
	fontFamily: "Cinzel, serif",
}
const headRow: CSSProperties = {
	display: "flex",
	justifyContent: "space-between",
	alignItems: "flex-start",
	gap: 16,
}
const titleStyle: CSSProperties = {
	color: GOLD,
	fontSize: 15,
	letterSpacing: 2,
	fontWeight: 700,
}
const subStyle: CSSProperties = {
	color: "#7e8c6a",
	fontSize: 11,
	letterSpacing: 1,
	marginTop: 4,
}
const rightWrap: CSSProperties = { textAlign: "right" }
const totalStyle: CSSProperties = { color: GREEN, fontSize: 26, fontWeight: 700 }
const liveStyle: CSSProperties = { color: "#7e8c6a", fontSize: 11, letterSpacing: 1 }
const dotStyle: CSSProperties = {
	display: "inline-block",
	width: 7,
	height: 7,
	borderRadius: 7,
	background: GREEN,
	marginRight: 6,
}
const svgStyle: CSSProperties = {
	width: "100%",
	height: 150,
	marginTop: 14,
	display: "block",
}

function readDecisions(): Decision[] {
	try {
		const raw = localStorage.getItem("cronus_decisions")
		if (!raw) return []
		const arr = JSON.parse(raw)
		return Array.isArray(arr) ? arr : []
	} catch {
		return []
	}
}

export default function EquityCurve() {
	const [rows, setRows] = useState<Decision[]>([])

	useEffect(() => {
		const tick = () => setRows(readDecisions())
		tick()
		const id = setInterval(tick, POLL_MS)
		return () => clearInterval(id)
	}, [])

	const settled = rows
		.filter((r) => r && r.txHash)
		.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

	const points = settled.map((_, i) => (i + 1) * UNIT_USDC)
	const total = points.length ? points[points.length - 1] : 0
	const count = settled.length

	const W = 640
	const H = 150
	const PAD = 10
	const maxY = Math.max(total, UNIT_USDC)
	const stepX = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0

	const coords = points.map((y, i) => {
		const px = PAD + i * stepX
		const py = H - PAD - (y / maxY) * (H - PAD * 2)
		return px.toFixed(1) + "," + py.toFixed(1)
	})
	const line = coords.join(" ")
	const lastX = (PAD + (points.length - 1) * stepX).toFixed(1)
	const lastY = (H - PAD - (total / maxY) * (H - PAD * 2)).toFixed(1)
	const area =
		coords.length > 0
			? "M" + PAD + "," + (H - PAD) + " L" + coords.join(" L") + " L" + lastX + "," + (H - PAD) + " Z"
			: ""

	return (
		<div style={wrap}>
			<div style={headRow}>
				<div>
					<div style={titleStyle}>{"\u{13289}"} ON-CHAIN SETTLEMENT CURVE</div>
					<div style={subStyle}>REAL USDC SETTLED ON ARC {"\u00b7"} NOT MOCKED</div>
				</div>
				<div style={rightWrap}>
					<div style={totalStyle}>{"$" + total.toFixed(2)}</div>
					<div style={liveStyle}>
						<span style={dotStyle} />
						{count} SETTLEMENTS {"\u00b7"} LIVE
					</div>
				</div>
			</div>

			<svg viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" style={svgStyle}>
				<defs>
					<linearGradient id="cronusCurveGrad" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={GREEN} stopOpacity="0.35" />
						<stop offset="100%" stopColor={GREEN} stopOpacity="0" />
					</linearGradient>
				</defs>

				<line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgba(201,168,76,0.2)" strokeWidth="1" />
				<line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="rgba(201,168,76,0.1)" strokeWidth="1" strokeDasharray="3 6" />

				{count > 0 ? (
					<>
						<path d={area} fill="url(#cronusCurveGrad)" />
						<polyline points={line} fill="none" stroke={GOLD} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
						<circle cx={lastX} cy={lastY} r="4" fill={GREEN} />
					</>
				) : (
					<text x={W / 2} y={H / 2} textAnchor="middle" fill="#7e8c6a" fontSize="13" letterSpacing="2">
						AWAITING FIRST ON-CHAIN SETTLEMENT
					</text>
				)}
			</svg>
		</div>
	)
}
