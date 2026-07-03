import { useEffect, useState } from "react"

type Rcpt = {
	ok?: boolean
	verified?: boolean
	txHash?: string
	kind?: string
	http402?: { priceUsdc?: number; priceAtomic?: string; payTo?: string }
	payer?: string
	payTo?: string
	amountUsdc?: number
	priceMatches?: boolean
	toTreasury?: boolean
	isUsdc?: boolean
	block?: number | null
	settledAt?: string | null
	commitment?: string | null
	memoId?: string | null
	nonCustodial?: boolean
	explorer?: string
	reason?: string
}

function short(h: string) {
	return h && h.length > 18 ? h.slice(0, 10) + "…" + h.slice(-6) : h
}

export function ReceiptCard() {
	const [tx, setTx] = useState("")
	const [data, setData] = useState<Rcpt | null>(null)
	const [loading, setLoading] = useState(false)
	const [err, setErr] = useState("")

	async function verify(hash: string) {
		const h = (hash || "").trim().toLowerCase()
		if (!/^0x[0-9a-f]{64}$/.test(h)) { setErr("Enter a valid tx hash (0x + 64 hex)."); setData(null); return }
		setErr(""); setLoading(true)
		try {
			const r = await fetch("/api/info?kind=receipt&tx=" + h)
			const j = (await r.json()) as Rcpt
			setData(j)
		} catch { setErr("Lookup failed — try again.") }
		setLoading(false)
	}

	useEffect(() => {
		let alive = true
		;(async () => {
			try {
				const r = await fetch("/api/metrics")
				if (!r.ok) return
				const j = (await r.json()) as { lastTx?: string }
				const last = j && j.lastTx ? String(j.lastTx).trim().toLowerCase() : ""
				if (!alive || !/^0x[0-9a-f]{64}$/.test(last)) return
				setTx(last)
				const rr = await fetch("/api/info?kind=receipt&tx=" + last)
				const rj = (await rr.json()) as Rcpt
				if (alive) setData(rj)
			} catch { /* fail-open: empty input */ }
		})()
		return () => { alive = false }
	}, [])

	const v = !!(data && data.verified === true)
	const rows: Array<{ k: string; val: string; ok?: boolean }> = data ? [
		{ k: "payer", val: data.payer ? short(data.payer) : "—" },
		{ k: "amount", val: data.amountUsdc != null ? data.amountUsdc + " USDC" : "—" },
		{ k: "x402 price", val: data.http402 && data.http402.priceUsdc != null ? data.http402.priceUsdc + " USDC (" + (data.http402.priceAtomic || "") + " atomic)" : "—" },
		{ k: "price matches", val: data.priceMatches ? "yes" : "no", ok: !!data.priceMatches },
		{ k: "settles to treasury", val: data.toTreasury ? "yes" : "no", ok: !!data.toTreasury },
		{ k: "asset is Arc USDC", val: data.isUsdc ? "yes" : "no", ok: !!data.isUsdc },
		{ k: "block", val: data.block != null ? String(data.block) : "—" },
		{ k: "settled at", val: data.settledAt ? data.settledAt.replace("T", " ").replace(".000Z", " UTC") : "—" },
		{ k: "commitment", val: data.commitment ? short(data.commitment) : "n/a (live payment)" },
		{ k: "non-custodial", val: data.nonCustodial ? "yes — payer-signed" : "—", ok: !!data.nonCustodial },
	] : []

	return (
		<div className="cd-box">
			<div className="cd-box-head">
				<span className="cd-box-title">𓂀 VERIFIABLE RECEIPT</span>
				<span className="cd-box-src">live · /api/info?kind=receipt · no keys</span>
			</div>
			<div className="cd-box-note">Paste any payment tx hash — Cronus re-checks it live on the Arc explorer and binds it to the exact x402 price and the agent's on-chain commitment. Pre-filled with the latest settlement.</div>
			<div className="cd-rcpt-form">
				<input className="cd-rcpt-in" value={tx} onChange={e => setTx(e.target.value)} placeholder="0x… payment tx hash" spellCheck={false} />
				<button className="cd-rcpt-btn" onClick={() => verify(tx)} disabled={loading}>{loading ? "Verifying…" : "Verify receipt"}</button>
			</div>
			{err ? <div className="cd-rcpt-err">{err}</div> : null}
			{data ? (
				<div className="cd-rcpt-out">
					<div className={v ? "cd-rcpt-badge cd-rcpt-ok" : "cd-rcpt-badge cd-rcpt-bad"}>{v ? "✓ VERIFIED ON-CHAIN" : "UNVERIFIED"}</div>
					{!v && data.reason ? <div className="cd-rcpt-note">{data.reason}</div> : null}
					<div className="cd-rcpt-rows">
						{rows.map(row => (
							<div className="cd-rcpt-row" key={row.k}>
								<span className="cd-rcpt-k">{row.k}</span>
								<span className={row.ok === true ? "cd-rcpt-v cd-rcpt-vok" : "cd-rcpt-v"}>{row.val}</span>
							</div>
						))}
					</div>
					{data.explorer ? <a className="cd-box-link" href={data.explorer} target="_blank" rel="noreferrer">open tx on Arc explorer ↗</a> : null}
				</div>
			) : null}
		</div>
	)
}
