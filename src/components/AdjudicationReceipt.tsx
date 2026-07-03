import { useEffect, useState } from "react"

type Pos = {
	id?: string
	marketId?: string
	verdict?: string
	conviction?: number | null
	stakeUsdc?: number
	status?: string
	commitment?: string | null
	openTxExplorer?: string | null
	resolveTxExplorer?: string | null
	resolveBy?: number | null
}
type TR = {
	ok?: boolean
	accuracy?: number | null
	resolved_positions?: number
	open_positions?: number
	total_returned_usdc?: number
	total_slashed_usdc?: number
	realized_pnl_usdc?: number
	positions?: Pos[]
	rules?: { conviction_gate?: number; commitment?: string; slash?: string }
}

function short(h?: string | null) {
	return h && h.length > 18 ? h.slice(0, 10) + "…" + h.slice(-6) : (h || "—")
}
function fmtUsd(v: number | undefined) {
	return Number(v || 0).toFixed(3) + " USDC"
}
function badge(status?: string) {
	if (status === "correct") return { cls: "cd-rcpt-badge cd-rcpt-ok", label: "✓ CORRECT · STAKE RETURNED" }
	if (status === "wrong") return { cls: "cd-rcpt-badge cd-rcpt-bad", label: "✗ WRONG · STAKE BURNED" }
	return { cls: "cd-rcpt-badge", label: "◷ OPEN · COMMITTED, AWAITING OUTCOME" }
}

export function AdjudicationReceipt() {
	const [tr, setTr] = useState<TR | null>(null)
	const [degraded, setDegraded] = useState(false)

	useEffect(() => {
		let alive = true
		const load = async () => {
			try {
				const r = await fetch("/api/track-record")
				const j = (await r.json()) as TR
				if (alive) setTr(j)
			} catch { if (alive) setDegraded(true) }
		}
		load()
		const iv = setInterval(load, 30000)
		return () => { alive = false; clearInterval(iv) }
	}, [])

	const positions = tr && Array.isArray(tr.positions) ? tr.positions : []
	const ordered = [...positions].sort((a, b) => {
		const rank = (s?: string) => (s === "correct" || s === "wrong" ? 0 : 1)
		return rank(a.status) - rank(b.status)
	}).slice(0, 4)

	return (
		<div className="cd-box">
			<div className="cd-box-head">
				<span className="cd-box-title">𓂀 AGENT ADJUDICATION RECEIPT</span>
				<span className="cd-box-src">live · /api/track-record · self-scored on-chain{degraded ? " · degraded" : ""}</span>
			</div>
			<div className="cd-box-note">Cronus adjudicates its own verdicts against <b>objective on-chain market outcomes</b> — not a subjective score. The decision rule and stake are committed (keccak256) <b>before</b> the result is known, then settled verifiably at resolve time: correct → stake returned, wrong → stake burned (provably unrecoverable).</div>
			{ordered.length ? (
				<div className="cd-gr-checks">
					{ordered.map((p, idx) => {
						const b = badge(p.status)
						return (
							<div className="cd-gr-check" key={p.id || idx}>
								<div className={b.cls}>{b.label}</div>
								<div className="cd-rcpt-rows">
									<div className="cd-rcpt-row"><span className="cd-rcpt-k">market</span><span className="cd-rcpt-v">{p.marketId || "—"}</span></div>
									<div className="cd-rcpt-row"><span className="cd-rcpt-k">verdict</span><span className="cd-rcpt-v">{p.verdict || "—"}{p.conviction != null ? " · conv " + (p.conviction * 100).toFixed(0) + "%" : ""}</span></div>
									<div className="cd-rcpt-row"><span className="cd-rcpt-k">staked</span><span className="cd-rcpt-v">{fmtUsd(p.stakeUsdc)}</span></div>
									<div className="cd-rcpt-row"><span className="cd-rcpt-k">commitment</span><span className="cd-rcpt-v">{short(p.commitment)}</span></div>
								</div>
								<div className="cd-adj-links">
									{p.openTxExplorer ? <a className="cd-box-link" href={p.openTxExplorer} target="_blank" rel="noreferrer">commit tx ↗</a> : null}
									{p.resolveTxExplorer ? <a className="cd-box-link" href={p.resolveTxExplorer} target="_blank" rel="noreferrer">settle tx ↗</a> : null}
								</div>
							</div>
						)
					})}
				</div>
			) : (
				<div className="cd-box-note">No staked verdicts recorded yet — accuracy stays honest (null) until real positions resolve on-chain. Never backfilled.</div>
			)}
			<div className="cd-rcpt-rows">
				<div className="cd-rcpt-row"><span className="cd-rcpt-k">resolved</span><span className="cd-rcpt-v">{tr && tr.resolved_positions != null ? tr.resolved_positions : "—"}</span></div>
				<div className="cd-rcpt-row"><span className="cd-rcpt-k">accuracy</span><span className="cd-rcpt-v">{tr && tr.accuracy != null ? (tr.accuracy * 100).toFixed(0) + "%" : "n/a (no resolved calls)"}</span></div>
				<div className="cd-rcpt-row"><span className="cd-rcpt-k">returned / burned</span><span className="cd-rcpt-v">{fmtUsd(tr ? tr.total_returned_usdc : 0)} / {fmtUsd(tr ? tr.total_slashed_usdc : 0)}</span></div>
			</div>
		</div>
	)
}
