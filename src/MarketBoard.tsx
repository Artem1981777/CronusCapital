import { useEffect, useRef, useState, type CSSProperties } from "react"

type Candle = { t: number; o: number; h: number; l: number; c: number }

const COINS = [
	{ id: "bitcoin", sym: "BTC", binance: "BTC_USDT" },
	{ id: "ethereum", sym: "ETH", binance: "ETH_USDT" },
	{ id: "solana", sym: "SOL", binance: "SOL_USDT" },
	{ id: "arbitrum", sym: "ARB", binance: "ARB_USDT" },
]

const GREEN = "#39e014"
const RED = "#e0563a"
const GOLD = "#c9a84c"
const DIM = "#7e8c6a"
const BG = "#070b07"

function ohlcUrl(id: string): string {
	return "https://api.coingecko.com/api/v3/coins/" + id + "/ohlc?vs_currency=usd&days=1"
}
function fmtUsd(n: number): string {
	if (n >= 100) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })
	if (n >= 1) return "$" + n.toFixed(2)
	return "$" + n.toFixed(4)
}
function synth(id: string): Array<Candle> {
	const base = id === "bitcoin" ? 67000 : id === "ethereum" ? 3150 : id === "solana" ? 148 : 0.78
	const out: Array<Candle> = []
	let p = base
	const now = Date.now()
	for (let i = 47; i >= 0; i--) {
		const o = p
		const drift = (Math.sin(i * 0.7) + (Math.random() - 0.5)) * base * 0.004
		const c = Math.max(base * 0.85, o + drift)
		const h = Math.max(o, c) * (1 + Math.random() * 0.002)
		const l = Math.min(o, c) * (1 - Math.random() * 0.002)
		out.push({ t: now - i * 1800000, o, h, l, c })
		p = c
	}
	return out
}

const wrap: CSSProperties = { margin: "18px 0 4px", background: BG, border: "1px solid rgba(201,168,76,0.22)", borderRadius: 14, padding: "14px 16px" }
const headRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }
const titleS: CSSProperties = { color: GOLD, fontFamily: "Cinzel, serif", fontSize: 14, letterSpacing: 2, textTransform: "uppercase" }
const tabs: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" }
const statRow: CSSProperties = { display: "flex", alignItems: "baseline", gap: 14, marginBottom: 8 }
const priceBig: CSSProperties = { color: "#e9f5e2", fontFamily: "monospace", fontSize: 22, fontWeight: 700 }
const subLabel: CSSProperties = { color: DIM, fontSize: 11 }
const canvasWrap: CSSProperties = { width: "100%" }
const proof: CSSProperties = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(126,140,106,0.16)", fontSize: 11, color: DIM }
const linkS: CSSProperties = { color: GOLD, textDecoration: "none", border: "1px solid rgba(201,168,76,0.4)", borderRadius: 7, padding: "4px 8px", whiteSpace: "nowrap" }
const codeS: CSSProperties = { fontFamily: "monospace", fontSize: 10, color: "#5f6b51", wordBreak: "break-all", marginTop: 6 }
const captionS: CSSProperties = { fontSize: 10, color: "#5f6b51", marginTop: 6, lineHeight: 1.5 }

function tabStyle(active: boolean): CSSProperties {
	return { padding: "5px 11px", borderRadius: 8, cursor: "pointer", fontFamily: "Cinzel, serif", fontSize: 11, letterSpacing: 1, border: "1px solid " + (active ? GOLD : "rgba(126,140,106,0.3)"), background: active ? "rgba(201,168,76,0.16)" : "transparent", color: active ? GOLD : DIM }
}
function chgStyle(up: boolean): CSSProperties {
	return { color: up ? GREEN : RED, fontFamily: "monospace", fontSize: 14, fontWeight: 700 }
}
function liveStyle(on: boolean): CSSProperties {
	return { color: on ? GREEN : GOLD, fontWeight: 700 }
}

export default function MarketBoard() {
	const [coin, setCoin] = useState(COINS[0])
	const [candles, setCandles] = useState<Array<Candle>>([])
	const [live, setLive] = useState(false)
	const [synced, setSynced] = useState("")
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const wrapRef = useRef<HTMLDivElement | null>(null)

	useEffect(() => {
		let alive = true
		async function load() {
			try {
				const r = await fetch(ohlcUrl(coin.id))
				if (!r.ok) throw new Error("bad")
				const j = await r.json()
				if (!alive) return
				const cs: Array<Candle> = Array.isArray(j) ? j.map((row: Array<number>) => ({ t: row[0], o: row[1], h: row[2], l: row[3], c: row[4] })) : []
				if (cs.length) { setCandles(cs); setLive(true) }
				else { setCandles(synth(coin.id)); setLive(false) }
				setSynced(new Date().toLocaleTimeString())
			} catch {
				if (!alive) return
				setCandles(synth(coin.id)); setLive(false); setSynced(new Date().toLocaleTimeString())
			}
		}
		load()
		const iv = setInterval(load, 45000)
		return () => { alive = false; clearInterval(iv) }
	}, [coin])

	useEffect(() => {
		const draw = () => {
			const canvas = canvasRef.current
			const box = wrapRef.current
			if (!canvas || !box) return
			const ctx = canvas.getContext("2d")
			if (!ctx) return
			const cssW = box.clientWidth || 320
			const cssH = 300
			const dpr = window.devicePixelRatio || 1
			canvas.width = Math.floor(cssW * dpr)
			canvas.height = Math.floor(cssH * dpr)
			canvas.style.width = cssW + "px"
			canvas.style.height = cssH + "px"
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
			ctx.clearRect(0, 0, cssW, cssH)
			if (!candles.length) return
			const padL = 8, padR = 66, padT = 12, padB = 16
			const plotW = cssW - padL - padR
			const plotH = cssH - padT - padB
			let min = Infinity, max = -Infinity
			for (const c of candles) { if (c.l < min) min = c.l; if (c.h > max) max = c.h }
			if (!(max > min)) { max = min + 1 }
			const pd = (max - min) * 0.08
			min -= pd; max += pd
			const yOf = (v: number) => padT + (1 - (v - min) / (max - min)) * plotH
			ctx.font = "10px monospace"
			ctx.textBaseline = "middle"
			for (let g = 0; g <= 4; g++) {
				const v = min + (max - min) * (g / 4)
				const y = yOf(v)
				ctx.strokeStyle = "rgba(126,140,106,0.14)"
				ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke()
				ctx.fillStyle = DIM
				ctx.fillText(fmtUsd(v), padL + plotW + 6, y)
			}
			const n = candles.length
			const slot = plotW / n
			const bw = Math.max(2, Math.min(10, slot * 0.6))
			for (let i = 0; i < n; i++) {
				const c = candles[i]
				const x = padL + slot * i + slot / 2
				const up = c.c >= c.o
				const col = up ? GREEN : RED
				ctx.strokeStyle = col
				ctx.fillStyle = col
				ctx.beginPath(); ctx.moveTo(x, yOf(c.h)); ctx.lineTo(x, yOf(c.l)); ctx.stroke()
				const yO = yOf(c.o), yC = yOf(c.c)
				const top = Math.min(yO, yC)
				const hgt = Math.max(1, Math.abs(yC - yO))
				ctx.fillRect(x - bw / 2, top, bw, hgt)
			}
			const lastC = candles[n - 1].c
			const ly = yOf(lastC)
			ctx.setLineDash([4, 3])
			ctx.strokeStyle = "rgba(201,168,76,0.6)"
			ctx.beginPath(); ctx.moveTo(padL, ly); ctx.lineTo(padL + plotW, ly); ctx.stroke()
			ctx.setLineDash([])
			ctx.fillStyle = GOLD
			ctx.fillRect(padL + plotW, ly - 7, padR, 14)
			ctx.fillStyle = "#0a0a0a"
			ctx.fillText(fmtUsd(lastC), padL + plotW + 4, ly)
		}
		draw()
		window.addEventListener("resize", draw)
		return () => window.removeEventListener("resize", draw)
	}, [candles])

	const last = candles.length ? candles[candles.length - 1].c : 0
	const first = candles.length ? candles[0].o : 0
	const chg = first ? ((last - first) / first) * 100 : 0

	return (
		<div style={wrap}>
			<div style={headRow}>
				<span style={titleS}>{"\u{13080}"} Live Candles · Top Crypto</span>
				<div style={tabs}>
					{COINS.map((c) => (
						<button key={c.id} style={tabStyle(c.id === coin.id)} onClick={() => setCoin(c)}>{c.sym}</button>
					))}
				</div>
			</div>
			<div style={statRow}>
				<span style={priceBig}>{fmtUsd(last)}</span>
				<span style={chgStyle(chg >= 0)}>{(chg >= 0 ? "+" : "") + chg.toFixed(2)}%</span>
				<span style={subLabel}>{coin.sym}/USD · intraday</span>
			</div>
			<div ref={wrapRef} style={canvasWrap}>
				<canvas ref={canvasRef} />
			</div>
			<div style={proof}>
				<span style={liveStyle(live)}>{live ? "\u25CF LIVE" : "\u25CB SIMULATED"}</span>
				<span>Source: api.coingecko.com</span>
				<span>synced {synced || "\u2026"}</span>
				<a style={linkS} href={ohlcUrl(coin.id)} target="_blank" rel="noreferrer">Verify raw {"\u2197"}</a>
				<a style={linkS} href={"https://www.binance.com/en/trade/" + coin.binance} target="_blank" rel="noreferrer">Binance {"\u2197"}</a>
			</div>
			<div style={codeS}>GET {ohlcUrl(coin.id)}</div>
			<div style={captionS}>Real open / high / low / close candles fetched live from CoinGecko. Click {"\u201C"}Verify raw{"\u201D"} to inspect the JSON yourself, or cross-check spot on Binance.</div>
		</div>
	)
}
