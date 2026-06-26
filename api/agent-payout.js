import { keccak256, toHex } from "viem"

export const config = { maxDuration: 30 }

const KV_URL = process.env.KV_REST_API_URL || ""
const KV_TOKEN = process.env.KV_REST_API_TOKEN || ""
const POLICY_KEY = "cronus:payout:policy"
const AVAIL_KEY = "cronus:payout:available"
const LEDGER_KEY = "cronus:payout:ledger"
const HEAD_KEY = "cronus:payout:head"
const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000"
const G_RE = /^G[A-Z2-7]{55}$/

const DEFAULT_POLICY = {
	enabled: true,
	recipientG: "GBNJ2JNNLKQ53MO353PPOTNKI47DMHWVULKXMJMNLQWPF3FBIOA2CAZK",
	sharePct: 30,
	minThresholdUSDC: 1,
	perPayoutCapUSDC: 5,
}

async function fetchT(url, opts, ms) {
	const c = new AbortController()
	const t = setTimeout(function () { c.abort() }, ms || 5000)
	try {
		const merged = Object.assign({}, opts || {}, { signal: c.signal })
		return await fetch(url, merged)
	} finally { clearTimeout(t) }
}
async function kvCmd(path) {
	if (!KV_URL || !KV_TOKEN) return null
	try {
		const r = await fetchT(KV_URL + path, { headers: { Authorization: "Bearer " + KV_TOKEN } }, 5000)
		if (!r.ok) return null
		const j = await r.json()
		return j.result
	} catch { return null }
}
async function kvGet(key) { return await kvCmd("/get/" + encodeURIComponent(key)) }
async function kvSet(key, val) { return await kvCmd("/set/" + encodeURIComponent(key) + "/" + encodeURIComponent(val)) }
async function kvLpush(key, val) { return await kvCmd("/lpush/" + encodeURIComponent(key) + "/" + encodeURIComponent(val)) }
async function kvLrange(key, a, b) { return await kvCmd("/lrange/" + encodeURIComponent(key) + "/" + a + "/" + b) }

async function getPolicy() {
	const raw = await kvGet(POLICY_KEY)
	if (!raw) return Object.assign({}, DEFAULT_POLICY)
	try { return Object.assign({}, DEFAULT_POLICY, JSON.parse(raw)) } catch { return Object.assign({}, DEFAULT_POLICY) }
}

function decide(policy, available) {
	if (!policy.enabled) return { action: "hold", amount: 0, reason: "policy disabled" }
	if (!G_RE.test(policy.recipientG || "")) return { action: "hold", amount: 0, reason: "no valid recipient" }
	if (available < policy.minThresholdUSDC) return { action: "hold", amount: 0, reason: "available below min threshold" }
	let amt = available * (policy.sharePct / 100)
	if (amt > policy.perPayoutCapUSDC) amt = policy.perPayoutCapUSDC
	amt = Math.floor(amt * 10000) / 10000
	if (amt <= 0) return { action: "hold", amount: 0, reason: "computed amount is zero" }
	return { action: "payout", amount: amt, reason: "routing " + policy.sharePct + " percent of available revenue to Stellar" }
}

async function appendLedger(entry) {
	const prev = (await kvGet(HEAD_KEY)) || ZERO
	const body = JSON.stringify(entry)
	const hash = keccak256(toHex(prev + body))
	const record = Object.assign({ prevHash: prev, hash: hash }, entry)
	await kvLpush(LEDGER_KEY, JSON.stringify(record))
	await kvSet(HEAD_KEY, hash)
	return record
}

async function readLedger(n) {
	const arr = await kvLrange(LEDGER_KEY, 0, (n || 10) - 1)
	if (!Array.isArray(arr)) return []
	const out = []
	for (let i = 0; i < arr.length; i++) {
		try { out.push(JSON.parse(arr[i])) } catch {}
	}
	return out
}

export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
	res.setHeader("Access-Control-Allow-Headers", "Content-Type")
	if (req.method === "OPTIONS") { res.status(200).end(); return }

	const q = req.query || {}
	const action = q.action || "status"

	if (action === "status") {
		const policy = await getPolicy()
		const availRaw = await kvGet(AVAIL_KEY)
		const available = availRaw ? Number(availRaw) : 0
		const ledger = await readLedger(10)
		res.status(200).json({ policy: policy, available: available, ledger: ledger })
		return
	}

	if (action === "set-available") {
		const v = Number(q.value)
		if (!isFinite(v) || v < 0) { res.status(400).json({ detail: "invalid value" }); return }
		await kvSet(AVAIL_KEY, String(v))
		res.status(200).json({ ok: true, available: v })
		return
	}

	if (action === "set-policy") {
		const policy = await getPolicy()
		if (q.recipientG) policy.recipientG = String(q.recipientG)
		if (q.sharePct) policy.sharePct = Number(q.sharePct)
		if (q.minThresholdUSDC) policy.minThresholdUSDC = Number(q.minThresholdUSDC)
		if (q.perPayoutCapUSDC) policy.perPayoutCapUSDC = Number(q.perPayoutCapUSDC)
		if (typeof q.enabled !== "undefined") policy.enabled = q.enabled === "true"
		await kvSet(POLICY_KEY, JSON.stringify(policy))
		res.status(200).json({ ok: true, policy: policy })
		return
	}

	if (action === "decide") {
		const policy = await getPolicy()
		let available
		if (typeof q.available !== "undefined") available = Number(q.available)
		else { const a = await kvGet(AVAIL_KEY); available = a ? Number(a) : 0 }
		if (!isFinite(available) || available < 0) { res.status(400).json({ detail: "invalid available" }); return }
		const d = decide(policy, available)
		const entry = {
			at: new Date().toISOString(),
			action: d.action,
			amount: d.amount,
			available: available,
			recipientG: policy.recipientG,
			reason: d.reason,
		}
		const record = await appendLedger(entry)
		res.status(200).json({ decision: record })
		return
	}

	res.status(400).json({ detail: "unknown action" })
}
