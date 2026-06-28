import { useEffect, useState } from "react"

type NanoMetrics = {
	total_calls: number
	unique_external_payers: number
	nano_micros: string
	settlement_count: number
	batch_ratio: number
	nano_usdc: number
	self_demo_calls: number
}
type Standard = { payments?: number; totalUsdc?: number; lastTx?: string; source?: string } | null
type TractionResp = { ok: boolean; network?: string; treasury?: string; nano?: NanoMetrics; standard?: Standard }
type Leader = { payer: string; calls: number; micros: string; usdc: number; settlements: number }
type LeaderResp = { ok: boolean; count?: number; leaders?: Array<Leader> }

const EXPLORER = "https://testnet.arcscan.app"
const short = (a: string) => (a && a.length > 10 ? a.slice(0, 6) + "\u2026" + a.slice(-4) : a)

export default function NanoTraction() {
	const [t, setT] = useState<TractionResp | null>(null)
	const [lb, setLb] = useState<Array<Leader>>([])
	const [err, setErr] = useState("")

	useEffect(() => {
		let alive = true
		const load = async () => {
			try {
				const [tr, lr] = await Promise.all([
					fetch("/api/traction").then((r) => r.json() as Promise<TractionResp>),
					fetch("/api/leaderboard").then((r) => r.json() as Promise<LeaderResp>),
				])
				if (!alive) return
				setT(tr)
				setLb(Array.isArray(lr.leaders) ? lr.leaders : [])
				setErr("")
			} catch (e) {
				if (alive) setErr(String((e as Error).message || e))
			}
		}
		load()
		const id = setInterval(load, 20000)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])

	const n = t?.nano
	const batch = n?.batch_ratio || 0
	const calls = n?.total_calls || 0
	const settlements = n?.settlement_count || 0
	const ext = n?.unique_external_payers || 0
	const selfDemo = n?.self_demo_calls || 0
	const vol = n?.nano_usdc || 0
	const std = t?.standard || null
	const lastTx = std?.lastTx || ""

	return (
		<section className="cd-nano">
			<div className="cd-nano-head">
				<span className="cd-card-label">NANO PAYMENTS · Circle Gateway</span>
				<span className="cd-nano-tag">gas-free · Circle Gateway</span>
			</div>

			<div className="cd-nano-hero">
				<div className="cd-nano-hero-num">{calls > 0 ? calls : "\u2014"}</div>
				<div className="cd-nano-hero-sub">
					{calls > 0 ? "gas-free nano-payments \u00b7 Circle Gateway (EIP-3009, sub-cent)" : "no nano payments yet"}
				</div>
			</div>

			<div className="cd-nano-grid">
				<div className="cd-card-glow"><div className="cd-card-label">Nano calls</div><div className="cd-card-value">{calls}</div></div>
				<div className="cd-card-glow"><div className="cd-card-label">Gateway settlements</div><div className="cd-card-value">{settlements}</div></div>
				<div className="cd-card-glow"><div className="cd-card-label">External payers</div><div className="cd-card-value">{ext}</div></div>
				<div className="cd-card-glow"><div className="cd-card-label">Nano volume</div><div className="cd-card-value">${vol.toFixed(6)}</div></div>
			</div>

			<div className="cd-nano-tiers">
				<span className="cd-nano-tier cd-nano-tier-on">NANO · $0.001</span>
				<span className="cd-nano-tier cd-nano-tier-on">STANDARD · $0.02</span>
				<span className="cd-nano-tier">STREAM · soon</span>
			</div>

			<div className="cd-nano-foot">
				<span>Self-demo (A2A): <b>{selfDemo}</b> · honestly labeled autonomous traffic</span><span> · Batching: Circle Gateway batches many signed authorizations \u2192 1 on-chain settlement at scale; on Arc testnet each call settles individually ({batch || 1}:1 observed)</span>
				{std ? <span> · STANDARD on-chain: <b>{std.payments || 0}</b> calls · ${Number(std.totalUsdc || 0).toFixed(2)}</span> : null}
			</div>

			<div className="cd-nano-lb">
				<div className="cd-card-label">External A2A payers (treasury/self excluded)</div>
				{lb.length === 0 ? (
					<div className="cd-nano-empty">No external A2A payers yet \u2014 leaderboard stays honest (no self-padding).</div>
				) : (
					<ol className="cd-nano-lblist">
						{lb.map((r) => (
							<li key={r.payer} className="cd-nano-lbrow">
								<span className="cd-nano-lbaddr">{short(r.payer)}</span>
								<span className="cd-nano-lbcalls">{r.calls} calls</span>
								<span className="cd-nano-lbusd">${r.usdc.toFixed(6)}</span>
							</li>
						))}
					</ol>
				)}
			</div>

			<div className="cd-nano-links">
				<a href={EXPLORER + "/address/" + (t?.treasury || "")} target="_blank" rel="noreferrer">payTo on arcscan</a>
				{lastTx ? <a href={EXPLORER + "/tx/" + lastTx} target="_blank" rel="noreferrer"> · latest settlement tx</a> : null}
			</div>

			{err ? <div className="cd-nano-err">traction unavailable: {err}</div> : null}
		</section>
	)
}
