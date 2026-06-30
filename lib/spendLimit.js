// lib/spendLimit.js — programmable spending limits for autonomous payouts.
// Enforces a hard daily cap and a per-recipient cap before any USDC leaves the agent wallet.
// GET (no auth) = transparency: policy + today's spend + remaining + recent log.
// POST: action=check (no auth, dry) | set-policy (auth) | spend (auth, enforce + execute).
// Signs with STAKE_PRIVATE_KEY. Routed via vercel.json -> /api/info?kind=spend-limit.
import { createWalletClient, createPublicClient, http, defineChain, erc20Abi, getAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID || "5042002")
const ARC_RPC = process.env.ARC_RPC || process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"
const EXPLORER = process.env.ARC_EXPLORER || "https://testnet.arcscan.app"
const USDC_ADDRESS = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000")
const POLICY_KEY = "cronus:spend:policy"
const LOG_KEY = "cronus:spend:log"
const DEFAULT_DAILY = process.env.SPEND_DAILY_CAP_ATOMIC || "1000000"
const DEFAULT_RECIPIENT = process.env.SPEND_RECIPIENT_CAP_ATOMIC || "250000"
const arcChain = defineChain({ id: ARC_CHAIN_ID, name: "arc-testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [ARC_RPC] } } })
function normPk(pk) { if (!pk) return null; return pk.startsWith("0x") ? pk : "0x" + pk }
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
function dayKey() { return "cronus:spend:day:" + new Date().toISOString().slice(0, 10) }
async function readPolicy() {
	const raw = await kvCmd(["GET", POLICY_KEY])
	let p = null
	if (raw) { try { p = typeof raw === "string" ? JSON.parse(raw) : raw } catch (_) {} }
	if (!p) p = {}
	return { dailyCapAtomic: String(p.dailyCapAtomic || DEFAULT_DAILY), perRecipientCapAtomic: String(p.perRecipientCapAtomic || DEFAULT_RECIPIENT), enabled: p.enabled === false ? false : true }
}
async function readToday() { const v = await kvCmd(["GET", dayKey()]); return BigInt(v || "0") }
function readBody(req) {
	if (req.body) { if (typeof req.body === "string") { try { return JSON.parse(req.body) } catch (_) { return {} } } return req.body }
	return {}
}
function decide(policy, todayAtomic, amountAtomic) {
	const reasons = []
	let ok = true
	if (!policy.enabled) { ok = false; reasons.push("policy disabled") }
	const amt = BigInt(amountAtomic || "0")
	if (amt <= 0n) { ok = false; reasons.push("amount must be > 0") }
	const perCap = BigInt(policy.perRecipientCapAtomic)
	if (amt > perCap) { ok = false; reasons.push("exceeds per-recipient cap") }
	const daily = BigInt(policy.dailyCapAtomic)
	const remaining = daily > todayAtomic ? daily - todayAtomic : 0n
	if (amt > remaining) { ok = false; reasons.push("exceeds remaining daily budget") }
	return { allowed: ok, reasons: reasons, remainingDailyAtomic: String(remaining), perRecipientCapAtomic: String(perCap), dailyCapAtomic: String(daily) }
}
export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
	res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization")
	if (req.method === "OPTIONS") { res.status(200).end(); return }
	const policy = await readPolicy()
	const today = await readToday()
	if (req.method !== "POST") {
		const logRaw = await kvCmd(["LRANGE", LOG_KEY, "0", "9"])
		const log = Array.isArray(logRaw) ? logRaw.map((s) => { try { return typeof s === "string" ? JSON.parse(s) : s } catch (_) { return null } }).filter(Boolean) : []
		const daily = BigInt(policy.dailyCapAtomic)
		const remaining = daily > today ? daily - today : 0n
		res.status(200).json({ ok: true, mode: "policy", date: new Date().toISOString().slice(0, 10), policy: policy, spentTodayAtomic: String(today), remainingDailyAtomic: String(remaining), scale: 1e6, recent: log, note: "Hard daily + per-recipient caps enforced before any USDC leaves the agent wallet. POST action=check for a dry decision." })
		return
	}
	const body = readBody(req)
	const action = String((req.query && req.query.action) || body.action || "check").toLowerCase()
	if (action === "check") {
		const d = decide(policy, today, body.amountAtomic)
		res.status(200).json({ ok: true, action: "check", to: body.to || null, amountAtomic: String(body.amountAtomic || "0"), decision: d })
		return
	}
	const secret = process.env.CRON_SECRET || ""
	const auth = (req.headers && req.headers.authorization) || ""
	if (!secret || auth !== "Bearer " + secret) { res.status(401).json({ ok: false, error: "unauthorized" }); return }
	if (action === "set-policy") {
		const next = { dailyCapAtomic: String(body.dailyCapAtomic || policy.dailyCapAtomic), perRecipientCapAtomic: String(body.perRecipientCapAtomic || policy.perRecipientCapAtomic), enabled: body.enabled === false ? false : true }
		await kvCmd(["SET", POLICY_KEY, JSON.stringify(next)])
		res.status(200).json({ ok: true, action: "set-policy", policy: next })
		return
	}
	if (action === "spend") {
		let toAddr
		try { toAddr = getAddress(String(body.to)) } catch (_) { res.status(400).json({ ok: false, error: "invalid 'to' address" }); return }
		const amount = BigInt(body.amountAtomic || "0")
		const d = decide(policy, today, String(amount))
		if (!d.allowed) { res.status(409).json({ ok: false, action: "spend", error: "blocked by policy", decision: d }); return }
		const pk = normPk(process.env.STAKE_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY)
		if (!pk) { res.status(500).json({ ok: false, error: "STAKE_PRIVATE_KEY not set" }); return }
		const lock = await kvCmd(["SET", "cronus:spend:lock", "1", "NX", "EX", "30"])
		if (lock !== "OK") { res.status(409).json({ ok: false, error: "spend already in progress" }); return }
		try {
			const account = privateKeyToAccount(pk)
			const publicClient = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })
			const walletClient = createWalletClient({ account: account, chain: arcChain, transport: http(ARC_RPC) })
			const hash = await walletClient.writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "transfer", args: [toAddr, amount] })
			const rc = await publicClient.waitForTransactionReceipt({ hash: hash })
			if (rc.status !== "success") { res.status(502).json({ ok: false, error: "transfer reverted", tx: hash }); return }
			const newTotal = await kvCmd(["INCRBY", dayKey(), String(amount)])
			await kvCmd(["EXPIRE", dayKey(), "172800"])
			await kvCmd(["LPUSH", LOG_KEY, JSON.stringify({ to: toAddr.toLowerCase(), amountAtomic: String(amount), tx: hash, ts: Date.now() })])
			await kvCmd(["LTRIM", LOG_KEY, "0", "49"])
			res.status(200).json({ ok: true, action: "spend", tx: hash, explorer: EXPLORER + "/tx/" + hash, to: toAddr, amountAtomic: String(amount), spentTodayAtomic: String(newTotal), from: account.address })
		} catch (e) { res.status(502).json({ ok: false, error: String((e && e.message) || e) }) } finally { await kvCmd(["DEL", "cronus:spend:lock"]) }
		return
	}
	res.status(400).json({ ok: false, error: "unknown action: " + action })
}
