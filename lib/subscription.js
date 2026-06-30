// lib/subscription.js — subscriptions & metered access for the agent's paid signal API.
// A subscriber holds a plan granting a call quota for a period; each access is metered.
// GET (no auth) = plans + optional ?subscriber= status. POST: plans/status (no auth) | subscribe/access (auth).
// Payment settles via the existing x402 signal flow. Routed via vercel.json -> /api/info?kind=subscription.
const PLANS = {
	daily: { id: "daily", priceAtomic: "500000", periodSeconds: 86400, callQuota: 100 },
	weekly: { id: "weekly", priceAtomic: "2500000", periodSeconds: 604800, callQuota: 1000 },
	monthly: { id: "monthly", priceAtomic: "8000000", periodSeconds: 2592000, callQuota: 5000 }
}
async function kvCmd(cmd) {
	const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
	const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
	if (!base || !token) return null
	try {
		const r = await fetch(base, { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(cmd) })
		const j = await r.json()
		return j && j.result
	} catch (_) { return null }
}
function readBody(req) {
	if (req.body) { if (typeof req.body === "string") { try { return JSON.parse(req.body) } catch (_) { return {} } } return req.body }
	return {}
}
function subKey(addr) { return "cronus:sub:" + String(addr).toLowerCase() }
function isActive(sub, now) { return sub && Number(sub.expiresAt) > now && Number(sub.callsUsed) < Number(sub.callsQuota) }
async function readSub(addr) {
	if (!addr) return null
	const raw = await kvCmd(["GET", subKey(addr)])
	if (!raw) return null
	try { return typeof raw === "string" ? JSON.parse(raw) : raw } catch (_) { return null }
}
function statusOf(s, now) { return s ? { plan: s.plan, expiresAt: s.expiresAt, callsQuota: s.callsQuota, callsUsed: s.callsUsed, active: isActive(s, now) } : { active: false, note: "no subscription" } }
export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
	res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization")
	if (req.method === "OPTIONS") { res.status(200).end(); return }
	const now = Date.now()
	if (req.method !== "POST") {
		const subscriber = req.query && req.query.subscriber ? String(req.query.subscriber) : null
		const status = subscriber ? statusOf(await readSub(subscriber), now) : null
		res.status(200).json({ ok: true, mode: "plans", plans: Object.values(PLANS), subscriber: subscriber, status: status, scale: 1e6, note: "Subscribe (auth) grants a call quota for a period; each access is metered. Payment settles via the x402 signal flow." })
		return
	}
	const body = readBody(req)
	const action = String((req.query && req.query.action) || body.action || "plans").toLowerCase()
	if (action === "plans") { res.status(200).json({ ok: true, action: "plans", plans: Object.values(PLANS) }); return }
	if (action === "status") { res.status(200).json({ ok: true, action: "status", subscriber: body.subscriber || null, status: statusOf(await readSub(body.subscriber), now) }); return }
	const secret = process.env.CRON_SECRET || ""
	const auth = (req.headers && req.headers.authorization) || ""
	if (!secret || auth !== "Bearer " + secret) { res.status(401).json({ ok: false, error: "unauthorized" }); return }
	if (action === "subscribe") {
		const subscriber = body.subscriber ? String(body.subscriber).toLowerCase() : null
		if (!subscriber) { res.status(400).json({ ok: false, error: "subscriber required" }); return }
		const plan = PLANS[String(body.planId || "").toLowerCase()]
		if (!plan) { res.status(400).json({ ok: false, error: "unknown planId" }); return }
		const record = { subscriber: subscriber, plan: plan.id, priceAtomic: plan.priceAtomic, startedAt: now, expiresAt: now + plan.periodSeconds * 1000, callsQuota: plan.callQuota, callsUsed: 0, paymentTx: body.paymentTx || null }
		await kvCmd(["SET", subKey(subscriber), JSON.stringify(record)])
		res.status(200).json({ ok: true, action: "subscribe", subscription: record })
		return
	}
	if (action === "access") {
		const subscriber = body.subscriber ? String(body.subscriber).toLowerCase() : null
		if (!subscriber) { res.status(400).json({ ok: false, error: "subscriber required" }); return }
		const s = await readSub(subscriber)
		if (!s) { res.status(402).json({ ok: false, error: "no subscription", active: false }); return }
		if (Number(s.expiresAt) <= now) { res.status(402).json({ ok: false, error: "subscription expired", active: false }); return }
		if (Number(s.callsUsed) >= Number(s.callsQuota)) { res.status(429).json({ ok: false, error: "quota exhausted", active: false, callsUsed: s.callsUsed, callsQuota: s.callsQuota }); return }
		s.callsUsed = Number(s.callsUsed) + 1
		await kvCmd(["SET", subKey(subscriber), JSON.stringify(s)])
		res.status(200).json({ ok: true, action: "access", allowed: true, callsUsed: s.callsUsed, callsRemaining: Number(s.callsQuota) - Number(s.callsUsed), expiresAt: s.expiresAt })
		return
	}
	res.status(400).json({ ok: false, error: "unknown action: " + action })
}
