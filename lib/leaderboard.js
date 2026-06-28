// lib/leaderboard.js — public nano-payer leaderboard (treasury/self excluded).
// Routed as /api/leaderboard via vercel.json -> /api/info?kind=leaderboard.
import { leaderboard, readNanoLedger, TREASURY } from "./traction.js"

export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120")
	try {
		const limit = Math.min(50, Math.max(1, Number((req.query && req.query.limit) || 10) || 10))
		const ledger = await readNanoLedger()
		const rows = leaderboard(ledger, { exclude: [TREASURY], limit })
		res.status(200).json({
			ok: true,
			treasury: TREASURY,
			count: rows.length,
			leaders: rows,
			note: "treasury/self excluded — only real external A2A payers ranked",
			updatedAt: new Date().toISOString(),
		})
	} catch (e) {
		res.status(502).json({ ok: false, error: String((e && e.message) || e) })
	}
}
