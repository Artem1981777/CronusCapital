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
				external_payers: onchain.onchain_external_payers,
				external_txs: onchain.onchain_external_txs,
				external_usdc: onchain.onchain_external_usdc,
				external_leaders: onchain.onchain_leaders.slice(0, limit),
				canonical_field: "external_payers",
				headline_note: "external_payers / external_leaders are the canonical on-chain ranking. unique_external_payers and leaders[] track ONLY the separate nano KV ledger and stay 0/empty until a nano-tier external payer appears.",
			ok: true,
			treasury: TREASURY,
			unique_external_payers: ext.size,
				onchain_external_payers: onchain.onchain_external_payers,
				onchain_external_txs: onchain.onchain_external_txs,
				onchain_external_usdc: onchain.onchain_external_usdc,
				onchain_leaders: onchain.onchain_leaders.slice(0, limit),
			self_demo_calls: selfDemo,
			count: rows.length,
			leaders: rows,
			note: "treasury/self excluded — only real external A2A payers ranked; self_demo_calls shown separately for honesty",
			updatedAt: new Date().toISOString(),
		})
	} catch (e) {
		res.status(200).json({ ok: false, error: String((e && e.message) || e), leaders: [], count: 0, unique_external_payers: 0, self_demo_calls: 0 })
	}
}
