import { buildTreasuryYield } from "./usyc.js"

// The fund publishes a new share price about once a day, so re-reading twenty
// chain values on every request is waste, not rigor. The response is cached
// briefly and always states how old it is; ?fresh=1 forces a full re-read.
const CACHE_KEY = "cronus:treasury:usyc"
const TTL_SECONDS = Number(process.env.TREASURY_CACHE_TTL || "900")

async function kvCmd(cmd) {
	const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
	const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
	if (!base || !token) return null
	try {
		const r = await fetch(base, {
			method: "POST",
			headers: { Authorization: "Bearer " + token, "content-type": "application/json" },
			body: JSON.stringify(cmd),
		})
		const j = await r.json()
		return j && j.result
	} catch (_) {
		return null
	}
}

async function treasuryYield(req, res) {
	const q = req.query || {}
	const horizonDays = Math.min(365, Math.max(1, Number(q.days || 30)))
	const fresh = String(q.fresh || "") === "1"
	const key = CACHE_KEY + ":" + horizonDays

	if (!fresh) {
		const hit = await kvCmd(["GET", key])
		if (hit) {
			try {
				const obj = typeof hit === "string" ? JSON.parse(hit) : hit
				const age = Math.round((Date.now() - Number(obj.cachedAt || 0)) / 1000)
				if (obj && obj.body && age >= 0 && age <= TTL_SECONDS) {
					return res.status(200).json({
						...obj.body,
						cache: {
							hit: true,
							ageSeconds: age,
							ttlSeconds: TTL_SECONDS,
							note: "read from Arc " + age + "s ago; the fund updates its share price about once a day. Add ?fresh=1 to re-read the chain now.",
						},
					})
				}
			} catch (_) { /* fall through to a live read */ }
		}
	}

	try {
		const out = await buildTreasuryYield({ horizonDays })
		await kvCmd(["SET", key, JSON.stringify({ cachedAt: Date.now(), body: out }), "EX", String(TTL_SECONDS)])
		return res.status(200).json({ ...out, cache: { hit: false, ageSeconds: 0, ttlSeconds: TTL_SECONDS, note: "read live from Arc for this request" } })
	} catch (e) {
		return res.status(502).json({ ok: false, error: "arc rpc unavailable", detail: String((e && e.message) || e) })
	}
}

export const TREASURY_ROUTES = { "treasury-yield": treasuryYield }
export default TREASURY_ROUTES
