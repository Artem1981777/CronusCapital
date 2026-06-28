import { useEffect, useState } from "react"
import type { CSSProperties } from "react"

type Receipt = { txHash?: string; amountUsdc?: number; payer?: string | null; explorer?: string; settledAt?: string | null; kind?: string }

const SIGNALS = ["BTC-USDC momentum", "ETH-USDC trend", "SOL-USDC breakout", "Macro risk regime"]

const wrapS: CSSProperties = { border: "1px solid #f59e0b44", borderRadius: 10, padding: "12px 14px", margin: "12px 0", background: "linear-gradient(180deg,#1c1407,#0e0a04)" }
const headS: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }
const titleS: CSSProperties = { fontWeight: 700, color: "#fbbf24", fontSize: 15 }
const toggleS: CSSProperties = { cursor: "pointer", border: "1px solid #f59e0b66", borderRadius: 8, padding: "3px 10px", color: "#fde68a", background: "transparent", fontSize: 12 }
const subS: CSSProperties = { color: "#9ca3af", fontSize: 11, margin: "6px 0 10px" }
const rowS: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: "1px solid #ffffff14" }
const sigNameS: CSSProperties = { color: "#e5e7eb", fontSize: 13 }
const unlockBtnS: CSSProperties = { cursor: "pointer", border: "1px solid #5eead488", borderRadius: 8, padding: "3px 10px", color: "#5eead4", background: "transparent", fontSize: 12 }
const verdictS: CSSProperties = { color: "#a7f3d0", fontSize: 12, fontWeight: 600 }
const secTitleS: CSSProperties = { color: "#fbbf24", fontSize: 12, fontWeight: 700, margin: "12px 0 4px" }
const feedRowS: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: "#cbd5e1", padding: "3px 0" }
const linkS: CSSProperties = { color: "#7dd3fc", textDecoration: "none" }
const noteS: CSSProperties = { color: "#f59e0b", fontSize: 10, marginTop: 8 }

function short(h: string): string {
	return h && h.length > 14 ? h.slice(0, 8) + "\u2026" + h.slice(-6) : (h || "")
}

export default function PublisherPanel() {
	const [open, setOpen] = useState(false)
	const [unlocked, setUnlocked] = useState<Record<string, string>>({})
	const [busy, setBusy] = useState<string>("")
	const [receipts, setReceipts] = useState<Array<Receipt>>([])
	const [total, setTotal] = useState(0)
	const [count, setCount] = useState(0)
	useEffect(() => {
		if (!open) return
		let alive = true
		const load = async () => {
			try {
				const r = await fetch("/api/receipts")
				const j = await r.json()
				if (alive && j && Array.isArray(j.receipts)) {
					setReceipts(j.receipts.slice(0, 8))
					setTotal(Number(j.totalUsdc || 0))
					setCount(Number(j.count || 0))
				}
			} catch {
				/* ignore */
			}
		}
		load()
		const id = window.setInterval(load, 30000)
		return () => {
			alive = false
			window.clearInterval(id)
		}
	}, [open])
	const unlock = async (topic: string) => {
		setBusy(topic)
		try {
			const r = await fetch("/api/stream?topic=" + encodeURIComponent(topic))
			const j = await r.json()
			const f = (j && j.frame) || {}
			setUnlocked((u) => ({ ...u, [topic]: String(f.verdict || "SKIP") + " (" + Number(f.conviction || 0) + ")" }))
		} catch {
			setUnlocked((u) => ({ ...u, [topic]: "preview unavailable" }))
		} finally {
			setBusy("")
		}
	}
	return (
		<section style={wrapS}>
			<div style={headS}>
				<span style={titleS}>{"\u{1F4F0} PUBLISHER \u2014 monetize each signal with nanopayments (RFB)"}</span>
				<button style={toggleS} onClick={() => setOpen((v) => !v)}>{open ? "Switch to Oracle view" : "Open Publisher view"}</button>
			</div>
			{open ? (
				<div>
					<div style={subS}>Persona: a publisher selling individual market signals. Each unlock is a $0.001 nanopayment settled gas-free via Circle Gateway; real settlement runs through the autonomous buyer-agent. Below is the public, on-chain settled-payments feed.</div>
					{SIGNALS.map((t) => (
						<div key={t} style={rowS}>
							<span style={sigNameS}>{t}</span>
							{unlocked[t] ? (
								<span style={verdictS}>{"\u2713 " + unlocked[t]}</span>
							) : (
								<button style={unlockBtnS} onClick={() => unlock(t)} disabled={busy === t}>{busy === t ? "unlocking\u2026" : "Unlock $0.001 nano"}</button>
							)}
						</div>
					))}
					<div style={secTitleS}>{"Public settled-payments feed \u00B7 " + count + " receipts \u00B7 " + total.toFixed(2) + " USDC"}</div>
					{receipts.length === 0 ? (
						<div style={subS}>{"Loading on-chain receipts\u2026"}</div>
					) : (
						receipts.map((r, i) => (
							<div key={(r.txHash || "") + i} style={feedRowS}>
								<span>{short(r.payer || "external") + " \u2192 " + (r.amountUsdc || 0) + " USDC"}</span>
								<a style={linkS} href={r.explorer || ("https://testnet.arcscan.app/tx/" + r.txHash)} target="_blank" rel="noreferrer">{short(r.txHash || "") + " \u2197"}</a>
							</div>
						))
					)}
					<div style={noteS}>On-chain receipts from /api/receipts (Arc explorer). Unlock previews use /api/stream; real per-signal settlement is executed via Circle Gateway nano by the buyer-agent (honest: not browser-side payment).</div>
				</div>
			) : null}
		</section>
	)
}
