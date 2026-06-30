// lib/splitPay.js — split-payment routing: fan out one USDC payment across multiple counterparties by basis-point weights.
// GET (no auth) = transparency: split config. POST: action=preview (no auth, no funds) | set-split (auth) | execute (auth).
// Signs with STAKE_PRIVATE_KEY. Routed via vercel.json -> /api/info?kind=split-pay.
import { createWalletClient, createPublicClient, http, defineChain, erc20Abi, getAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID || "5042002")
const ARC_RPC = process.env.ARC_RPC || process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"
const EXPLORER = process.env.ARC_EXPLORER || "https://testnet.arcscan.app"
const USDC_ADDRESS = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000")
const CONFIG_KEY = "cronus:split:config"
const LOG_KEY = "cronus:split:log"
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
function readBody(req) {
	if (req.body) { if (typeof req.body === "string") { try { return JSON.parse(req.body) } catch (_) { return {} } } return req.body }
	return {}
}
function normalizeRecipients(arr) {
	const out = []
	if (!Array.isArray(arr)) return out
	for (const r of arr) {
		if (!r) continue
		let addr
		try { addr = getAddress(String(r.address || r.to)) } catch (_) { continue }
		const bps = Math.floor(Number(r.bps || 0))
		if (!isFinite(bps) || bps <= 0) continue
		out.push({ address: addr, bps: bps })
	}
	return out
}
function totalBps(recips) { return recips.reduce((a, r) => a + r.bps, 0) }
function allocate(totalAtomic, recips) {
	const total = BigInt(totalAtomic || "0")
	const sumBps = BigInt(totalBps(recips) || 1)
	const allocs = []
	let assigned = 0n
	for (let i = 0; i < recips.length; i++) {
		let share
		if (i === recips.length - 1) share = total - assigned
		else { share = (total * BigInt(recips[i].bps)) / sumBps; assigned += share }
		allocs.push({ address: recips[i].address, bps: recips[i].bps, amountAtomic: String(share) })
	}
	return allocs
}
async function readConfig() {
	const raw = await kvCmd(["GET", CONFIG_KEY])
	let c = null
	if (raw) { try { c = typeof raw === "string" ? JSON.parse(raw) : raw } catch (_) {} }
	if (!c) c = {}
	return { recipients: normalizeRecipients(c.recipients || []), enabled: c.enabled === false ? false : true }
}
export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
	res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization")
	if (req.method === "OPTIONS") { res.status(200).end(); return }
	const config = await readConfig()
	if (req.method !== "POST") {
		const logRaw = await kvCmd(["LRANGE", LOG_KEY, "0", "9"])
		const log = Array.isArray(logRaw) ? logRaw.map((s) => { try { return typeof s === "string" ? JSON.parse(s) : s } catch (_) { return null } }).filter(Boolean) : []
		res.status(200).json({ ok: true, mode: "config", config: config, totalBps: totalBps(config.recipients), recent: log, note: "Fan out one USDC payment across counterparties by basis points. POST action=preview {amountAtomic, recipients?} for a no-funds allocation." })
		return
	}
	const body = readBody(req)
	const action = String((req.query && req.query.action) || body.action || "preview").toLowerCase()
	if (action === "preview") {
		const recips = body.recipients ? normalizeRecipients(body.recipients) : config.recipients
		if (recips.length === 0) { res.status(400).json({ ok: false, error: "no recipients" }); return }
		res.status(200).json({ ok: true, action: "preview", totalAtomic: String(body.amountAtomic || "0"), totalBps: totalBps(recips), allocations: allocate(body.amountAtomic || "0", recips) })
		return
	}
	const secret = process.env.CRON_SECRET || ""
	const auth = (req.headers && req.headers.authorization) || ""
	if (!secret || auth !== "Bearer " + secret) { res.status(401).json({ ok: false, error: "unauthorized" }); return }
	if (action === "set-split") {
		const recips = normalizeRecipients(body.recipients || [])
		if (recips.length === 0) { res.status(400).json({ ok: false, error: "no valid recipients" }); return }
		const sum = totalBps(recips)
		if (sum !== 10000) { res.status(400).json({ ok: false, error: "bps must sum to 10000, got " + sum }); return }
		const next = { recipients: recips, enabled: body.enabled === false ? false : true }
		await kvCmd(["SET", CONFIG_KEY, JSON.stringify(next)])
		res.status(200).json({ ok: true, action: "set-split", config: next })
		return
	}
	if (action === "execute") {
		if (!config.enabled) { res.status(409).json({ ok: false, error: "split disabled" }); return }
		const recips = config.recipients
		if (recips.length === 0) { res.status(400).json({ ok: false, error: "no recipients configured" }); return }
		const total = BigInt(body.amountAtomic || "0")
		if (total <= 0n) { res.status(400).json({ ok: false, error: "amount must be > 0" }); return }
		const pk = normPk(process.env.STAKE_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY)
		if (!pk) { res.status(500).json({ ok: false, error: "STAKE_PRIVATE_KEY not set" }); return }
		const lock = await kvCmd(["SET", "cronus:split:lock", "1", "NX", "EX", "60"])
		if (lock !== "OK") { res.status(409).json({ ok: false, error: "split already in progress" }); return }
		const results = []
		try {
			const account = privateKeyToAccount(pk)
			const publicClient = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })
			const walletClient = createWalletClient({ account: account, chain: arcChain, transport: http(ARC_RPC) })
			const allocs = allocate(String(total), recips)
			for (const a of allocs) {
				const amt = BigInt(a.amountAtomic)
				if (amt <= 0n) { results.push({ address: a.address, skipped: "zero" }); continue }
				try {
					const hash = await walletClient.writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "transfer", args: [a.address, amt] })
					const rc = await publicClient.waitForTransactionReceipt({ hash: hash })
					results.push({ address: a.address, bps: a.bps, amountAtomic: a.amountAtomic, tx: hash, explorer: EXPLORER + "/tx/" + hash, status: rc.status })
				} catch (e) { results.push({ address: a.address, error: String((e && e.message) || e) }) }
			}
			await kvCmd(["LPUSH", LOG_KEY, JSON.stringify({ totalAtomic: String(total), at: Date.now(), legs: results })])
			await kvCmd(["LTRIM", LOG_KEY, "0", "49"])
			res.status(200).json({ ok: true, action: "execute", totalAtomic: String(total), from: account.address, legs: results })
		} catch (e) { res.status(502).json({ ok: false, error: String((e && e.message) || e), partial: results }) } finally { await kvCmd(["DEL", "cronus:split:lock"]) }
		return
	}
	res.status(400).json({ ok: false, error: "unknown action: " + action })
}
