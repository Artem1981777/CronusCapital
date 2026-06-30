// api/info.js — consolidated read-only discovery/metrics/traction router.
// Preserves /api/manifest, /api/openapi, /api/receipts, /api/metrics,
// /api/traction, /api/leaderboard as public URLs via vercel.json rewrites
// (-> /api/info?kind=...), counting as ONE serverless function (Hobby 12-fn cap).
import manifest from "../lib/manifest.js"
import openapi from "../lib/openapi.js"
import receipts from "../lib/receipts.js"
import metrics from "../lib/metrics.js"
import traction from "../lib/traction.js"
import leaderboard from "../lib/leaderboard.js"
import settlements from "../lib/gateway.js"
import spendIntent from "../lib/intents.js"
import scorecard from "../lib/scorecard.js"
import trackRecord from "../lib/stake.js"
import resolveStake from "../lib/resolveStake.js"
import fundEscrow from "../lib/fundEscrow.js"
import spendLimit from "../lib/spendLimit.js"
import openStake from "../lib/openStake.js"

const ROUTES = { "spend-limit": spendLimit, "fund-escrow": fundEscrow, "resolve-stake": resolveStake, manifest, openapi, receipts, metrics, traction, leaderboard, settlements, "spend-intent": spendIntent, scorecard, "track-record": trackRecord, "open-stake": openStake }

export default async function handler(req, res) {
	const kind = String((req.query && req.query.kind) || "").toLowerCase()
	const fn = ROUTES[kind]
	if (!fn) {
		res.setHeader("Access-Control-Allow-Origin", "*")
		return res.status(404).json({ error: "unknown info kind", kind, available: Object.keys(ROUTES) })
	}
	return fn(req, res)
}
