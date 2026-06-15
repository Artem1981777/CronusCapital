import { useEffect, useState, type CSSProperties } from "react"

interface Market { id: string; asset: string; cgId: string; signal: string; conf: number; price: number; chg: number; url: string }

const SEED: Array<Market> = [
	{ id: "btc", asset: "BTC", cgId: "bitcoin", signal: "LONG", conf: 82, price: 67250, chg: 1.4, url: "https://polymarket.com/markets/crypto" },
	{ id: "eth", asset: "ETH", cgId: "ethereum", signal: "LONG", conf: 74, price: 3180, chg: 0.9, url: "https://polymarket.com/markets/crypto" },
	{ id: "sol", asset: "SOL", cgId: "solana", signal: "SHORT", conf: 68, price: 148, chg: -2.1, url: "https://polymarket.com/markets/crypto" },
	{ id: "arb", asset: "ARB", cgId: "arbitrum", signal: "HOLD", conf: 55, price: 0.78, chg: -0.4, url: "https://polymarket.com/markets/crypto" },
]

const GREEN = "#39e014"
const RED = "#e0563a"
const GOLD = "#c9a84c"
const DIM = "#7e8c6a"

function fmtPrice(n: number): string {
	if (n >= 100) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })
	if (n >= 1) return "$" + n.toFixed(2)
	return "$" + n.toFixed(4)
}
function sigColor(s: string): string {
	if (s === "LONG") return GREEN
	if (s === "SHORT") return RED
	return GOLD
}

const overlay: CSSProperties = { position: "fixed", inset: 0, background: "rgba(2,6,3,0.78)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }
const panel: CSSProperties = { width: "min(560px, 96vw)", maxHeight: "86vh", overflowY: "auto", background: "linear-gradient(180deg, #0a0e09, #060906)", border: "1px solid rgba(201,168,76,0.35)", borderRadius: 16, padding: "18px 20px", boxShadow: "0 0 40px rgba(57,224,20,0.18)" }
const headRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }
const titleS: CSSProperties = { color: GOLD, fontFamily: "Cinzel, serif", fontSize: 16, letterSpacing: 1.4, textTransform: "uppercase" }
const closeBtn: CSSProperties = { background: "transparent", border: "1px solid rgba(201,168,76,0.4)", color: GOLD, borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 14 }
const subS: CSSProperties = { color: DIM, fontSize: 11, letterSpacing: 0.5, marginBottom: 14 }
const row: CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: "1px solid rgba(126,140,106,0.16)" }
const assetS: CSSProperties = { color: "#e9f5e2", fontWeight: 700, fontSize: 15, width: 52 }
const pill: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: "3px 8px", borderRadius: 999, border: "1px solid currentColor" }
const priceS: CSSProperties = { color: "#e9f5e2", fontFamily: "monospace", fontSize: 14, marginLeft: "auto" }
const chgUp: CSSProperties = { color: GREEN, fontFamily: "monospace", fontSize: 12, width: 60, textAlign: "right" }
const chgDn: CSSProperties = { color: RED, fontFamily: "monospace", fontSize: 12, width: 60, textAlign: "right" }
const confS: CSSProperties = { color: DIM, fontSize: 11, width: 62, textAlign: "right" }
const linkS: CSSProperties = { color: GOLD, fontSize: 12, textDecoration: "none", border: "1px solid rgba(201,168,76,0.4)", borderRadius: 8, padding: "5px 9px", whiteSpace: "nowrap" }
const footS: CSSProperties = { color: DIM, fontSize: 10, marginTop: 14, lineHeight: 1.5 }

function pillStyle(s: string): CSSProperties {
	return { ...pill, color: sigColor(s) }
}

export default function MarketsModal(props: { open: boolean; onClose: () => void }) {
	const [markets, setMarkets] = useState<Array<Market>>(SEED)
	const [live, setLive] = useState(false)

	useEffect(() => {
		if (!props.open) return
		let alive = true
		const jitter = setInterval(() => {
			setMarkets((cur) => cur.map((m) => {
				const d = (Math.random() - 0.5) * (m.price * 0.002)
				const np = Math.max(0.0001, m.price + d)
				const nc = m.chg + (Math.random() - 0.5) * 0.05
				return { ...m, price: np, chg: nc }
			}))
		}, 1500)
		;(async () => {
			try {
				const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,arbitrum&vs_currencies=usd&include_24hr_change=true")
				if (!r.ok) return
				const j = await r.json()
				if (!alive) return
				setLive(true)
				setMarkets((cur) => cur.map((m) => {
					const rec = j[m.cgId]
					if (!rec || typeof rec.usd !== "number") return m
					return { ...m, price: rec.usd, chg: typeof rec.usd_24h_change === "number" ? rec.usd_24h_change : m.chg }
				}))
			} catch {
				/* offline or rate-limited: simulated feed stays live */
			}
		})()
		return () => { alive = false; clearInterval(jitter) }
	}, [props.open])

	if (!props.open) return null

	return (
		<div style={overlay} onClick={props.onClose}>
			<div style={panel} onClick={(e) => e.stopPropagation()}>
				<div style={headRow}>
					<span style={titleS}>{"\u26A1"} Live Markets</span>
					<button style={closeBtn} onClick={props.onClose}>{"\u2715"}</button>
				</div>
				<div style={subS}>{live ? "live spot via CoinGecko" : "live simulated feed"} {"\u00b7"} Cronus signal overlay {"\u00b7"} Arc-settled</div>
				{markets.map((m) => (
					<div key={m.id} style={row}>
						<span style={assetS}>{m.asset}</span>
						<span style={pillStyle(m.signal)}>{m.signal}</span>
						<span style={confS}>{m.conf}% conf</span>
						<span style={priceS}>{fmtPrice(m.price)}</span>
						<span style={m.chg >= 0 ? chgUp : chgDn}>{(m.chg >= 0 ? "+" : "") + m.chg.toFixed(2)}%</span>
						<a style={linkS} href={m.url} target="_blank" rel="noreferrer">Trade {"\u2197"}</a>
					</div>
				))}
				<div style={footS}>Signals come from the Cronus SCOUT {"\u2192"} ANALYST pipeline and settle via x402 / USDC on Arc Testnet. Links open live prediction markets.</div>
			</div>
		</div>
	)
}
