import { useEffect, useRef, useState, type CSSProperties } from "react"

const GLYPHS = "𓂀𓊽𓋹𓆣𓁹𓇋𓏏𓈖𓅓𓀀𓊪𓏤𓅱𓎛"

function colStyle(i: number): CSSProperties {
	return {
		left: (i / 16) * 100 + "%",
		animationDelay: (i % 8) * -1.9 + "s",
		animationDuration: 13 + (i % 6) * 3 + "s",
	}
}

function stream(seed: number): string {
	let s = ""
	for (let i = 0; i < 22; i++) s += GLYPHS[(seed * 5 + i * 3) % GLYPHS.length]
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
	const cols = Array.from({ length: 16 })
	return (
		<div ref={ref} className="egypt-bg" aria-hidden="true">
			<div className="egypt-stars" />
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
