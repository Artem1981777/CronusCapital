// lib/leaderboard.js — public nano-payer leaderboard (treasury/self excluded).
// Routed as /api/leaderboard via vercel.json -> /api/info?kind=leaderboard.
import { leaderboard, readNanoLedger, TREASURY, selfAddresses, reduceOnchainPayers, readReceipts, verifiedExternal, verifiedExternalList } from "./traction.js"

export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120")
	try {
		const limit = Math.min(50, Math.max(1, Number((req.query && req.query.limit) || 10) || 10))
		const ledger = await readNanoLedger()
		const rows = leaderboard(ledger, { exclude: selfAddresses(), limit })
			const host = (req.headers && req.headers.host) || "localhost"
			const receipts = await readReceipts(host)
			const onchain = reduceOnchainPayers(receipts, { exclude: selfAddresses() })
			const ext = verifiedExternal(receipts, { allowlist: verifiedExternalList(), self: selfAddresses() })
		const self = new Set(selfAddresses().map((a) => String(a).toLowerCase()))
		const extSeen = new Set()
		let selfDemo = 0
		for (const e of ledger) {
			const p = e.payer ? String(e.payer).toLowerCase() : null
			if (!p) continue
			if (self.has(p)) selfDemo++
			else extSeen.add(p)
		}
		res.status(200).json({
				external_payers: ext.external_payers,
				external_txs: ext.external_txs,
				external_usdc: ext.external_usdc,
				external_leaders: ext.external_leaders.slice(0, limit),
				canonical_field: "external_payers",
				headline_note: (ext.external_payers > 0 ? ("HONEST: external_payers = " + ext.external_payers + " verified third-party payer(s) - each explicitly allow-listed and independently funded, with payment on-chain in /api/receipts; self-generated test traffic stays labeled self_generated_* and is never counted as external demand.") : "HONEST: external_payers = 0 and external_leaders = [] (no verified third-party payer yet). self_generated_leaders ranks the wallets WE used across dev sessions to exercise the live x402 paywall; we never present our own test volume as external demand."),
			ok: true,
			treasury: TREASURY,
			unique_external_payers: extSeen.size,
				self_generated_wallets: onchain.onchain_external_payers,
				self_generated_txs: onchain.onchain_external_txs,
				self_generated_usdc: onchain.onchain_external_usdc,
				self_generated_leaders: onchain.onchain_leaders.slice(0, limit),
			self_demo_calls: selfDemo,
			count: rows.length,
			leaders: rows,
			note: (ext.external_payers > 0 ? "treasury/self excluded; external demand is verified + allow-listed (see external_leaders); self_generated_leaders ranks wallets WE used across dev sessions to test the paywall" : "treasury/self excluded - self_generated_leaders ranks wallets WE used across dev sessions to test the live paywall; never presented as external demand; honest external count is 0"),
			updatedAt: new Date().toISOString(),
		})
	} catch (e) {
		res.status(200).json({ ok: false, error: String((e && e.message) || e), leaders: [], count: 0, unique_external_payers: 0, self_demo_calls: 0 })
	}
}
