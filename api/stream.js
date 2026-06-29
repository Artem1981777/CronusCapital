// api/stream.js — STREAM SIGNALS tier: per-second nano stream frame generator.
// Real per-second micropayments are executed by the autonomous buyer-agent (--stream)
// via Circle Gateway; this endpoint serves the streamed signal frame + economics.
const TICK_MS      = Number(process.env.STREAM_TICK_MS || 1000)
const USD_PER_SEC  = Number(process.env.STREAM_USD_PER_SEC || 0.00001)

export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*")
	const host  = req.headers.host
	const topic = String((req.query && req.query.topic) || "BTC-USDC momentum")
	let frame = { verdict: "SKIP", conviction: 0, trace: [] }
	try {
		const r = await fetch("https://" + host + "/api/consult?topic=" + encodeURIComponent(topic) + "&instId=" + encodeURIComponent(topic))
		const j = await r.json()
		if (j && (j.verdict || j.trace)) {
			frame = { verdict: j.verdict || "SKIP", conviction: Number(j.conviction || 0), trace: Array.isArray(j.trace) ? j.trace.slice(0, 3) : [] }
		}
	} catch (e) { /* defensive: still return a valid frame */ }
	return res.status(200).json({
		ok: true,
		tier: "STREAM",
		topic,
		tickMs: TICK_MS,
		usdPerSec: USD_PER_SEC,
		incrementUsd: Number((USD_PER_SEC * (TICK_MS / 1000)).toFixed(6)),
		rail: "circle-gateway-nano",
		note: "Stream frame. Real per-second micropayments executed by the autonomous buyer-agent (--stream) via Circle Gateway; UI shows projected burn at the same rate.",
		ts: Date.now(),
		frame,
	})
}
