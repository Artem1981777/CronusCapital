// api/info.js — consolidated read-only discovery/metrics router.
// Preserves /api/manifest, /api/openapi, /api/receipts, /api/metrics as public
// URLs via vercel.json rewrites (-> /api/info?kind=...), while counting as ONE
// serverless function (Hobby plan 12-function cap). Logic unchanged: each kind
// delegates to its original handler, now living in ../lib/.
import manifest from "../lib/manifest.js"
import openapi from "../lib/openapi.js"
import receipts from "../lib/receipts.js"
import metrics from "../lib/metrics.js"

const ROUTES = { manifest, openapi, receipts, metrics }

export default async function handler(req, res) {
	const kind = String((req.query && req.query.kind) || "").toLowerCase()
	const fn = ROUTES[kind]
	if (!fn) {
		res.setHeader("Access-Control-Allow-Origin", "*")
		return res.status(404).json({ error: "unknown info kind", kind, available: Object.keys(ROUTES) })
	}
	return fn(req, res)
}
