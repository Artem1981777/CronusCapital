import { useEffect, useState } from "react"

type Decision = { allowed?: boolean; reasons?: string[]; remainingDailyAtomic?: string; perRecipientCapAtomic?: string; dailyCapAtomic?: string }
type CheckResp = { ok?: boolean; amountAtomic?: string; decision?: Decision }
type Policy = { dailyCapAtomic?: string; perRecipientCapAtomic?: string; enabled?: boolean }
type PolicyResp = { policy?: Policy; remainingDailyAtomic?: string; spentTodayAtomic?: string }

const TREASURY = "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd"

function usd(atomic: string | number | undefined) {
	const n = Number(atomic || 0)
	return (n / 1e6).toFixed(n % 1e6 === 0 ? 2 : 4) + " USDC"
}

export function GuardrailProof() {
	const [policy, setPolicy] = useState<Policy | null>(null)
	const [remaining, setRemaining] = useState("")
	const [blocked, setBlocked] = useState<CheckResp | null>(null)
	const [allowed, setAllowed] = useState<CheckResp | null>(null)
	const [intentFields, setIntentFields] = useState<string[]>([])
	const [loading, setLoading] = useState(false)
	const [degraded, setDegraded] = useState(false)

	async function run() {
		setLoading(true)
		let deg = false
		let perCap = 250000
		let rem = 1000000
		try {
			const r = await fetch("/api/spend-limit")
			const j = (await r.json()) as PolicyResp
			if (j && j.policy) { setPolicy(j.policy); perCap = Number(j.policy.perRecipientCapAtomic || perCap) }
			if (j && j.remainingDailyAtomic) { setRemaining(j.remainingDailyAtomic); rem = Number(j.remainingDailyAtomic) }
		} catch { deg = true }
		const over = String(perCap * 2)
		const okAmt = String(Math.max(1, Math.min(Math.floor(perCap / 2), Math.floor(rem / 2))))
		try {
			const rb = await fetch("/api/spend-limit?action=check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: TREASURY, amountAtomic: over }) })
			setBlocked((await rb.json()) as CheckResp)
		} catch { deg = true }
		try {
			const ra = await fetch("/api/spend-limit?action=check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: TREASURY, amountAtomic: okAmt }) })
			setAllowed((await ra.json()) as CheckResp)
		} catch { deg = true }
		try {
			const ri = await fetch("/api/spend-intent")
			const ji = (await ri.json()) as { types?: { SpendIntent?: Array<{ name?: string }> } }
			const fields = ji && ji.types && Array.isArray(ji.types.SpendIntent) ? ji.types.SpendIntent.map(f => String(f.name)).filter(Boolean) : []
			if (fields.length) setIntentFields(fields)
		} catch { deg = true }
		setDegraded(deg); setLoading(false)
	}

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		run()
	}, [])

	const bBlocked = !!(blocked && blocked.decision && blocked.decision.allowed === false)
	const aAllowed = !!(allowed && allowed.decision && allowed.decision.allowed === true)
	const bReason = blocked && blocked.decision && Array.isArray(blocked.decision.reasons) && blocked.decision.reasons.length ? blocked.decision.reasons.join(", ") : ""

	return (
		<div className="cd-box">
			<div className="cd-box-head">
				<span className="cd-box-title">𓂀 GUARDRAIL PROOF</span>
				<span className="cd-box-src">live · /api/spend-limit · /api/spend-intent{degraded ? " · degraded" : ""}</span>
			</div>
			<div className="cd-box-note">Every autonomous payout passes a hard policy check before any USDC leaves the wallet. Below are two live dry-run checks against the real policy — an oversized request is blocked, an in-budget one clears. No funds move.</div>
			<div className="cd-rcpt-rows">
				<div className="cd-rcpt-row"><span className="cd-rcpt-k">per-recipient cap</span><span className="cd-rcpt-v">{policy ? usd(policy.perRecipientCapAtomic) : "—"}</span></div>
				<div className="cd-rcpt-row"><span className="cd-rcpt-k">daily cap</span><span className="cd-rcpt-v">{policy ? usd(policy.dailyCapAtomic) : "—"}</span></div>
				<div className="cd-rcpt-row"><span className="cd-rcpt-k">remaining today</span><span className="cd-rcpt-v">{remaining ? usd(remaining) : "—"}</span></div>
			</div>
			<div className="cd-gr-checks">
				<div className="cd-gr-check">
					<div className={bBlocked ? "cd-rcpt-badge cd-rcpt-bad" : "cd-rcpt-badge"}>{bBlocked ? "⛔ BLOCKED" : "…"}</div>
					<div className="cd-gr-desc">Oversized request {blocked ? usd(blocked.amountAtomic) : ""}{bReason ? " — " + bReason : ""}. No provider funds move.</div>
				</div>
				<div className="cd-gr-check">
					<div className={aAllowed ? "cd-rcpt-badge cd-rcpt-ok" : "cd-rcpt-badge"}>{aAllowed ? "✓ ALLOWED" : "…"}</div>
					<div className="cd-gr-desc">In-budget request {allowed ? usd(allowed.amountAtomic) : ""} clears the policy.</div>
				</div>
			</div>
			{intentFields.length ? (
				<div className="cd-box-note">Autonomous spends also require an EIP-712 <b>SpendIntent</b>: Cronus recovers the signer and verifies {intentFields.join(" · ")}, binds provider (payTo) + asset to the treasury, and rejects replayed nonces and expired deadlines. Authorization only — moves no funds.</div>
			) : null}
			<button className="cd-rcpt-btn" onClick={() => run()} disabled={loading}>{loading ? "Checking…" : "Re-run checks"}</button>
		</div>
	)
}
