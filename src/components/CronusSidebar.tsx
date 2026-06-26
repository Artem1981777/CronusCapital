import { useState, useEffect } from "react"
import { useAccount, useChainId, useSwitchChain, useReadContract } from "wagmi"
import { WalletButton } from "./WalletButton"

const ARC_CHAIN_ID = 5042002
const USDC = "0x3600000000000000000000000000000000000000" as const
const ERC20_ABI = [ { type: "function", name: "balanceOf", stateMutability: "view", inputs: [ { name: "account", type: "address" } ], outputs: [ { type: "uint256" } ] } ] as const

interface NavItem { id: string; glyph: string; label: string; badge?: string }

const NAV: NavItem[] = [
	{ id: "cap-top", glyph: "𓂀", label: "Overview" },
	{ id: "cap-agents", glyph: "☥", label: "Oracle Agents", badge: "LIVE" },
	{ id: "cap-signals", glyph: "📡", label: "Premium Signals", badge: "x402" },
	{ id: "cap-markets", glyph: "📈", label: "Markets" },
	{ id: "cap-settlements", glyph: "⚡", label: "Settlements" },
	{ id: "cap-stellar", glyph: "✦", label: "Stellar", badge: "CCTP" },
]

export function CronusSidebar() {
	const [open, setOpen] = useState(false)
	const [active, setActive] = useState("cap-top")
	const [spend, setSpend] = useState({ count: 0, usd: 0 })
	const [settles, setSettles] = useState(0)
	const [earn, setEarn] = useState({ calls: 0, usd: 0 })
	const { address, isConnected } = useAccount()
	const chainId = useChainId()
	const { switchChain } = useSwitchChain()
	const onArc = chainId === ARC_CHAIN_ID
	const { data: bal } = useReadContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [address as `0x${string}`], query: { enabled: Boolean(address) } })
	const usdc = bal ? Number(bal as bigint) / 1e6 : 0

	useEffect(() => {
		const read = () => {
			try {
				const s = JSON.parse(localStorage.getItem("cronus.spend.v1") || "{}")
				setSpend({ count: Number(s.count) || 0, usd: Number(s.usd) || 0 })
				const d = JSON.parse(localStorage.getItem("cronus_decisions") || "[]")
				setSettles(Array.isArray(d) ? d.length : 0)
				const e = JSON.parse(localStorage.getItem("cronus_earnings") || '{"calls":0,"usd":0}')
				setEarn({ calls: Number(e.calls) || 0, usd: Number(e.usd) || 0 })
			} catch { /* ignore */ }
		}
		read()
		const t = setInterval(read, 2000)
		return () => clearInterval(t)
	}, [])

	function go(id: string) {
		setActive(id)
		if (id === "cap-top") window.scrollTo({ top: 0, behavior: "smooth" })
		else { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }) }
		setOpen(false)
	}

	function quickCast() {
		const topic = "crypto markets"
		const input = document.querySelector("input[placeholder='Enter market topic to analyze...']") as HTMLInputElement | null
		if (input) {
			const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")
			if (desc && desc.set) desc.set.call(input, topic)
			input.dispatchEvent(new Event("input", { bubbles: true }))
		}
		const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").trim().toUpperCase() === "CONSULT") as HTMLButtonElement | undefined
		window.scrollTo({ top: 0, behavior: "smooth" })
		setOpen(false)
		setTimeout(() => { if (btn) btn.click() }, 120)
	}

	return (
		<>
			<button className="cd-sb-toggle" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
			{open && <div className="cd-sb-overlay" onClick={() => setOpen(false)} />}
			<aside className={open ? "cd-sb open" : "cd-sb"}>
				<div className="cd-sb-head">
					<div className="cd-sb-brand"><span>𓂀</span>CRONUS</div>
					<button className="cd-sb-close" onClick={() => setOpen(false)}>✕</button>
				</div>
				<div className={onArc ? "cd-sb-pill" : "cd-sb-pill bad"}>
					<span className="cd-sb-dot" />
					<div className="cd-sb-pill-body">
						<div className="cd-sb-pill-title">{onArc ? "ARC TESTNET" : "WRONG NETWORK"}</div>
						<div className="cd-sb-pill-sub">sub-second · ~$0.01 USDC fee</div>
					</div>
					{!onArc && <button className="cd-sb-switch" onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}>SWITCH</button>}
				</div>
				<button className="cd-sb-cast" onClick={quickCast}>⚡ QUICK CAST</button>
				<div className="cd-sb-section">ORACLE</div>
				<nav className="cd-sb-nav">
					{NAV.map((n) => (
						<button key={n.id} className={active === n.id ? "cd-sb-item active" : "cd-sb-item"} onClick={() => go(n.id)}>
							<span className="cd-sb-glyph">{n.glyph}</span>
							<span className="cd-sb-text">{n.label}</span>
							{n.badge && <span className="cd-sb-badge">{n.badge}</span>}
						</button>
					))}
					<button className="cd-sb-item" onClick={() => window.open("https://github.com/Artem1981777/CronusCapital", "_blank")}>
						<span className="cd-sb-glyph">📖</span>
						<span className="cd-sb-text">Docs</span>
						<span className="cd-sb-badge gold">RFB 01/02</span>
					</button>
				</nav>
				<div className="cd-sb-meter">
					<div className="cd-sb-meter-label">𓏏 x402 SESSION</div>
					<div className="cd-sb-meter-row"><span className="cd-sb-big">{spend.count}</span><span className="cd-sb-cap">PAID CALLS</span></div>
					<div className="cd-sb-meter-row"><span className="cd-sb-usd">${spend.usd.toFixed(2)}</span><span className="cd-sb-cap">SPENT · USDC</span></div>
				</div>
				<div className="cd-sb-meter">
					<div className="cd-sb-meter-label">☥ ON-CHAIN LEDGER</div>
					<div className="cd-sb-meter-row"><span className="cd-sb-big">{settles}</span><span className="cd-sb-cap">SETTLEMENTS</span></div>
					<div className="cd-sb-meter-row"><span className="cd-sb-usd">${earn.usd.toFixed(2)}</span><span className="cd-sb-cap">EARNED · {earn.calls} CLIENTS</span></div>
				</div>
				<div className="cd-sb-foot">
					{isConnected && (
						<div className="cd-sb-wrow">
							<span className="cd-sb-addr">{address ? address.slice(0, 6) + "…" + address.slice(-4) : ""}</span>
							<span className="cd-sb-bal">{usdc.toFixed(2)} USDC</span>
						</div>
					)}
					<WalletButton />
					<div className="cd-sb-note">Wallet required for oracle actions</div>
				</div>
			</aside>
		</>
	)
}
