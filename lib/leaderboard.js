// lib/leaderboard.js — public nano-payer leaderboard (treasury/self excluded).
// Routed as /api/leaderboard via vercel.json -> /api/info?kind=leaderboard.
import { leaderboard, readNanoLedger, TREASURY, selfAddresses, reduceOnchainPayers, readReceipts } from "./traction.js"

export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120")
	try {
		const limit = Math.min(50, Math.max(1, Number((req.query && req.query.limit) || 10) || 10))
		const ledger = await readNanoLedger()
		const rows = leaderboard(ledger, { exclude: selfAddresses(), limit })
			const host = (req.headers && req.headers.host) || "localhost"
			const onchain = reduceOnchainPayers(await readReceipts(host), { exclude: selfAddresses() })
		const self = new Set(selfAddresses().map((a) => String(a).toLowerCase()))
		const ext = new Set()
		let selfDemo = 0
		for (const e of ledger) {
			const p = e.payer ? String(e.payer).toLowerCase() : null
			if (!p) continue
			if (self.has(p)) selfDemo++
			else ext.add(p)
		}
		res.status(200).json({
				external_payers: 0,
				external_txs: 0,
				external_usdc: 0,
				external_leaders: [],
				canonical_field: "external_payers",
				headline_note: "HONEST: external_payers = 0 and external_leaders = [] (no verified third-party payer yet). self_generated_leaders ranks the wallets WE used across dev sessions to exercise the live x402 paywall; we never present our own test volume as external demand.",
			ok: true,
			treasury: TREASURY,
			unique_external_payers: ext.size,
				self_generated_wallets: onchain.onchain_external_payers,
				self_generated_txs: onchain.onchain_external_txs,
				self_generated_usdc: onchain.onchain_external_usdc,
				self_generated_leaders: onchain.onchain_leaders.slice(0, limit),
			self_demo_calls: selfDemo,
			count: rows.length,
			leaders: rows,
			note: "treasury/self excluded — self_generated_leaders ranks wallets WE used across dev sessions to test the live paywall; never presented as external demand; honest external count is 0",
			updatedAt: new Date().toISOString(),
		})
	} catch (e) {
		res.status(200).json({ ok: false, error: String((e && e.message) || e), leaders: [], count: 0, unique_external_payers: 0, self_demo_calls: 0 })
	}
}
