import { useEffect, useState } from "react"

type Source = { id?: string; label?: string; priceUsdAtomic?: number; recipient?: string }
type CogsEntry = {
	label?: string
	sourceId?: string
	mode?: string
	amountAtomic?: string
	priceUsdAtomic?: number
	explorer?: string
	txRef?: string
	self_operated_demo?: boolean
	at?: number
}
type Cfg = {
	ok?: boolean
	enabled?: boolean
	settlement?: string
	perTxCapAtomic?: string
	sources?: Source[]
	settled_cogs_atomic?: number
	recent?: CogsEntry[]
}
type Probe = { conviction: number; buy: boolean; decision: string; sourceLabel: string | null }

const usdc = (atomic?: number | string) => (Number(atomic || 0) / 1e6).toFixed(4) + " USDC"

export function RationalSpend() {
	const [cfg, setCfg] = useState<Cfg | null>(null)
	const [probes, setProbes] = useState<Probe[]>([])
	const [degraded, setDegraded] = useState(false)

	useEffect(() => {
		let alive = true
		const load = async () => {
			try {
				const r = await fetch("/api/pay-to-think")
				const j = (await r.json()) as Cfg
				if (alive) setCfg(j)
			} catch { if (alive) setDegraded(true) }
			try {
				const out: Probe[] = []
				for (const c of [35, 60, 85]) {
					const rp = await fetch("/api/pay-to-think", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ action: "preview", conviction: c, force: true }),
					})
					const jp = await rp.json()
					out.push({
						conviction: c,
						buy: !!(jp && jp.buy),
						decision: String((jp && jp.decision) || ""),
						sourceLabel: jp && jp.source ? (jp.source.label || jp.source.id || null) : null,
					})
				}
				if (alive) setProbes(out)
			} catch { /* previews optional */ }
		}
		load()
		const iv = setInterval(load, 60000)
		return () => { alive = false; clearInterval(iv) }
	}, [])

	const sources = cfg && Array.isArray(cfg.sources) ? cfg.sources : []
	const recent = cfg && Array.isArray(cfg.recent) ? cfg.recent : []
	const settled = recent.filter((e) => e && e.mode === "settled").slice(0, 4)

	return (
		<div className="cd-box">
			<div className="cd-box-head">
				<span className="cd-box-title">𓂀 RATIONAL SPEND · PAY TO THINK</span>
				<span className="cd-box-src">live · /api/pay-to-think · budget-aware COGS{degraded ? " · degraded" : ""}</span>
			</div>
			<div className="cd-box-note">Cronus buys upstream data <b>only when a verdict is borderline</b> (high information value) and the cheapest source fits its budget — confident or throwaway-low calls skip, so it never overspends. Settled purchases are Cronus's <b>cost-of-goods</b> to self-operated demo feeds, tracked in a separate ledger and <b>never</b> counted as external revenue.</div>

			{probes.length ? (
				<div className="cd-gr-checks">
					{probes.map((p) => (
						<div className="cd-gr-check" key={p.conviction}>
							<div className={p.buy ? "cd-rcpt-badge cd-rcpt-ok" : "cd-rcpt-badge"}>{p.buy ? "BUY DATA" : "SKIP · NO WASTE"}</div>
							<div className="cd-rcpt-rows">
								<div className="cd-rcpt-row"><span className="cd-rcpt-k">conviction</span><span className="cd-rcpt-v">{p.conviction}</span></div>
								<div className="cd-rcpt-row"><span className="cd-rcpt-k">decision</span><span className="cd-rcpt-v">{p.decision || "—"}</span></div>
								{p.sourceLabel ? <div className="cd-rcpt-row"><span className="cd-rcpt-k">source</span><span className="cd-rcpt-v">{p.sourceLabel}</span></div> : null}
							</div>
						</div>
					))}
				</div>
			) : null}

			{sources.length ? (
				<div className="cd-rcpt-rows">
					{sources.map((s, i) => (
						<div className="cd-rcpt-row" key={s.id || i}><span className="cd-rcpt-k">{s.label || s.id}</span><span className="cd-rcpt-v">{usdc(s.priceUsdAtomic)}</span></div>
					))}
				</div>
			) : null}

			<div className="cd-rcpt-rows">
				<div className="cd-rcpt-row"><span className="cd-rcpt-k">settled COGS</span><span className="cd-rcpt-v">{usdc(cfg ? cfg.settled_cogs_atomic : 0)}</span></div>
				<div className="cd-rcpt-row"><span className="cd-rcpt-k">settlement</span><span className="cd-rcpt-v">{cfg && cfg.settlement ? cfg.settlement : "—"}</span></div>
			</div>

			{settled.length ? (
				<div className="cd-gr-checks">
					{settled.map((e, i) => (
						<div className="cd-gr-check" key={e.txRef || i}>
							<div className="cd-rcpt-badge cd-rcpt-ok">SETTLED · SELF-OPERATED DEMO</div>
							<div className="cd-rcpt-rows">
								<div className="cd-rcpt-row"><span className="cd-rcpt-k">source</span><span className="cd-rcpt-v">{e.label || e.sourceId || "—"}</span></div>
								<div className="cd-rcpt-row"><span className="cd-rcpt-k">paid</span><span className="cd-rcpt-v">{usdc(e.amountAtomic)}</span></div>
							</div>
							{e.explorer ? <div className="cd-adj-links"><a className="cd-box-link" href={e.explorer} target="_blank" rel="noreferrer">settle tx ↗</a></div> : null}
						</div>
					))}
				</div>
			) : (
				<div className="cd-box-note">No live COGS settlements recorded yet — the decisions above are dry-run (no funds move). Real settlement is gated and honestly labeled when it occurs.</div>
			)}
		</div>
	)
}
