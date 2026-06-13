import { useEffect, useRef, useState, type CSSProperties } from "react"

const GLYPHS = "𓂀𓊽𓋹𓆣𓁹𓇋𓏏𓈖𓅓𓀀𓊪𓏤𓅱𓎛𓇳𓅃𓊹𓀭𓆗𓃢𓏛𓎼𓋴𓂝𓆑𓅂𓃭"

const DEITIES = [
	{ g: "𓅃", top: "7%", left: "5%", size: 160 },
	{ g: "𓀭", top: "52%", left: "2%", size: 200 },
	{ g: "𓁢", top: "10%", left: "82%", size: 170 },
	{ g: "𓆗", top: "58%", left: "87%", size: 150 },
	{ g: "𓂀", top: "38%", left: "44%", size: 260 },
	{ g: "𓇳", top: "6%", left: "45%", size: 150 },
	{ g: "𓊹", top: "76%", left: "38%", size: 140 },
	{ g: "𓃢", top: "72%", left: "64%", size: 160 },
]

function colStyle(i: number): CSSProperties {
	return {
		left: (i / 24) * 100 + "%",
		animationDelay: (i % 9) * -1.7 + "s",
		animationDuration: 12 + (i % 6) * 3 + "s",
	}
}

function deityStyle(d: { top: string; left: string; size: number }, i: number): CSSProperties {
	return { top: d.top, left: d.left, fontSize: d.size + "px", animationDelay: (i % 5) * -1.3 + "s" }
}

function stream(seed: number): string {
	let s = ""
	for (let i = 0; i < 24; i++) s += GLYPHS[(seed * 5 + i * 3) % GLYPHS.length]
	return s
}

function wallRow(r: number): string {
	let s = ""
	for (let i = 0; i < 48; i++) s += GLYPHS[(r * 11 + i * 7) % GLYPHS.length]
	return s
}

function EgyptBackground() {
	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		function onMove(e: MouseEvent) {
			const el = ref.current
			if (!el) return
			el.style.setProperty("--mx", String(e.clientX / window.innerWidth - 0.5))
			el.style.setProperty("--my", String(e.clientY / window.innerHeight - 0.5))
		}
		window.addEventListener("mousemove", onMove)
		return () => window.removeEventListener("mousemove", onMove)
	}, [])
	const cols = Array.from({ length: 24 })
	const rows = Array.from({ length: 16 })
	return (
		<div ref={ref} className="egypt-bg" aria-hidden="true">
			<div className="egypt-stars" />
			<div className="hiero-wall">
				{rows.map((_, r) => (
					<div className="wall-row" key={r}>{wallRow(r)}</div>
				))}
			</div>
			<div className="deities">
				{DEITIES.map((d, i) => (
					<span className="deity" key={i} style={deityStyle(d, i)}>{d.g}</span>
				))}
			</div>
			<div className="hiero-rain">
				{cols.map((_, i) => (
					<span className="hiero-col" key={i} style={colStyle(i)}>{stream(i)}</span>
				))}
			</div>
			<div className="pyramid-wrap">
				<div className="pyramid" />
				<div className="pyramid-reflection" />
			</div>
			<div className="egypt-glow" />
		</div>
	)
}

function EgyptSplash() {
	const [fading, setFading] = useState(false)
	const [gone, setGone] = useState(false)
	useEffect(() => {
		const t1 = setTimeout(() => setFading(true), 2600)
		const t2 = setTimeout(() => setGone(true), 3500)
		return () => { clearTimeout(t1); clearTimeout(t2) }
	}, [])
	if (gone) return null
	return (
		<div className={fading ? "splash splash-out" : "splash"}>
			<div className="splash-rays" />
			<div className="splash-eye">𓂀</div>
			<div className="splash-pyramid" />
			<div className="splash-title">CRONUS CAPITAL</div>
			<div className="splash-sub">AWAKENING THE THREE ORACLES OF THE AGORA</div>
			<div className="splash-ankh">☥</div>
		</div>
	)
}

export function EgyptTheme() {
	return (
		<>
			<EgyptBackground />
			<EgyptSplash />
		</>
	)
}
