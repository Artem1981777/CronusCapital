import { keccak256, toHex } from "viem"
import { createWalletClient, createPublicClient, http, defineChain } from "viem"
import { privateKeyToAccount } from "viem/accounts"

export const config = { maxDuration: 60 }

const KV_URL = process.env.KV_REST_API_URL || ""
const KV_TOKEN = process.env.KV_REST_API_TOKEN || ""
const POLICY_KEY = "cronus:payout:policy"
const AVAIL_KEY = "cronus:payout:available"
const LEDGER_KEY = "cronus:payout:ledger"
const HEAD_KEY = "cronus:payout:head"
const LOCK_KEY = "cronus:payout:execlock"
const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000"
const G_RE = /^G[A-Z2-7]{55}$/

const ARC_USDC = "0x3600000000000000000000000000000000000000"
const ARC_TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA"
const STELLAR_FORWARDER = "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ"
const STELLAR_DOMAIN = 27
const ARC_RPC = "https://rpc.testnet.arc" + ".network"
const ARCSCAN = "https://testnet.arcscan" + ".app/tx/"
const ARC_CHAIN_ID = 5042002

const DEFAULT_POLICY = {
	enabled: true,
	recipientG: "GBNJ2JNNLKQ53MO353PPOTNKI47DMHWVULKXMJMNLQWPF3FBIOA2CAZK",
	sharePct: 30,
	minThresholdUSDC: 1,
	perPayoutCapUSDC: 5,
}

const ERC20_ABI = [
	{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
	{ type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
]
const TM_ABI = [
	{ type: "function", name: "depositForBurnWithHook", stateMutability: "nonpayable", inputs: [
		{ name: "amount", type: "uint256" },
		{ name: "destinationDomain", type: "uint32" },
		{ name: "mintRecipient", type: "bytes32" },
		{ name: "burnToken", type: "address" },
		{ name: "destinationCaller", type: "bytes32" },
		{ name: "maxFee", type: "uint256" },
		{ name: "minFinalityThreshold", type: "uint32" },
		{ name: "hookData", type: "bytes" },
	], outputs: [] },
]
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
function base32Decode(s) {
	let bits = 0
	let value = 0
	const out = []
	for (const ch of s) {
		const idx = B32.indexOf(ch)
		if (idx === -1) continue
		value = (value << 5) | idx
		bits += 5
		if (bits >= 8) {
			bits -= 8
			out.push((value >> bits) & 0xff)
		}
	}
	return new Uint8Array(out)
}
function hx(bytes) {
	let h = ""
	for (const b of bytes) h += b.toString(16).padStart(2, "0")
	return h
}
function strkeyToBytes32(strkey) {
	const raw = base32Decode(strkey.trim())
	const payload = raw.slice(1, 33)
	return "0x" + hx(payload)
}
function buildHookData(gAddr) {
	const rb = new TextEncoder().encode(gAddr.trim())
	const buf = new Uint8Array(32 + rb.length)
	const L = rb.length
	buf[28] = (L >>> 24) & 0xff
	buf[29] = (L >>> 16) & 0xff
	buf[30] = (L >>> 8) & 0xff
	buf[31] = L & 0xff
	buf.set(rb, 32)
	return "0x" + hx(buf)
}
function toUnits(amount, decimals) {
	const s = String(amount).trim()
	if (!s) return 0n
	const parts = s.split(".")
	const whole = parts[0] || "0"
	let frac = parts[1] || ""
	frac = (frac + "0".repeat(decimals)).slice(0, decimals)
	return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(frac || "0")
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
async function kvLock(key, sec) { return await kvCmd("/set/" + encodeURIComponent(key) + "/1?NX=true&EX=" + sec) }
async function kvDel(key) { return await kvCmd("/del/" + encodeURIComponent(key)) }

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

const arcChain = defineChain({
	id: ARC_CHAIN_ID,
	name: "Arc Testnet",
	nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
	rpcUrls: { default: { http: [ARC_RPC] } },
})
function normPk(pk) {
	const t = (pk || "").trim()
	if (!t) return ""
	return t.indexOf("0x") === 0 ? t : "0x" + t
}

async function runExecute(req, res, q) {
	const cronSecret = process.env.CRON_SECRET || ""
	const auth = req.headers ? (req.headers.authorization || "") : ""
	const trustedCron = Boolean(cronSecret) && (auth === "Bearer " + cronSecret || q.secret === cronSecret)
	const trigger = trustedCron ? "cron" : "manual"

	const policy = await getPolicy()
	let available
	if (typeof q.available !== "undefined") available = Number(q.available)
	else { const a = await kvGet(AVAIL_KEY); available = a ? Number(a) : 0 }
	if (!isFinite(available) || available < 0) { res.status(400).json({ detail: "invalid available" }); return }

	const d = decide(policy, available)
	if (d.action !== "payout") {
		const rec = await appendLedger({ at: new Date().toISOString(), action: "hold", amount: 0, available: available, recipientG: policy.recipientG, reason: d.reason, executed: false, trigger: trigger })
		res.status(200).json({ decision: rec, executed: false })
		return
	}

	const got = await kvLock(LOCK_KEY, 90)
	if (got === null && KV_URL) { res.status(429).json({ detail: "executor busy, try again shortly" }); return }

	const pk = normPk(process.env.TREASURY_PRIVATE_KEY)
	if (!pk) { await kvDel(LOCK_KEY); res.status(500).json({ detail: "TREASURY_PRIVATE_KEY not set" }); return }

	try {
		const account = privateKeyToAccount(pk)
		const publicClient = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })
		const walletClient = createWalletClient({ account: account, chain: arcChain, transport: http(ARC_RPC) })

		const amt = toUnits(d.amount, 6)
		if (amt <= 0n) { await kvDel(LOCK_KEY); res.status(400).json({ detail: "amount rounds to zero" }); return }
		const fwd = strkeyToBytes32(STELLAR_FORWARDER)
		const hook = buildHookData(policy.recipientG)
		const maxFee = amt / 100n

		let allowance = 0n
		try {
			allowance = await publicClient.readContract({ address: ARC_USDC, abi: ERC20_ABI, functionName: "allowance", args: [account.address, ARC_TOKEN_MESSENGER] })
		} catch { allowance = 0n }
		if (allowance < amt) {
			const approveHash = await walletClient.writeContract({ address: ARC_USDC, abi: ERC20_ABI, functionName: "approve", args: [ARC_TOKEN_MESSENGER, amt] })
			await publicClient.waitForTransactionReceipt({ hash: approveHash })
		}

		const burnHash = await walletClient.writeContract({ address: ARC_TOKEN_MESSENGER, abi: TM_ABI, functionName: "depositForBurnWithHook", args: [amt, STELLAR_DOMAIN, fwd, ARC_USDC, fwd, maxFee, 2000, hook] })
		await publicClient.waitForTransactionReceipt({ hash: burnHash })

		const remaining = Math.max(0, Math.round((available - d.amount) * 10000) / 10000)
		await kvSet(AVAIL_KEY, String(remaining))
		const rec = await appendLedger({ at: new Date().toISOString(), action: "payout", amount: d.amount, available: available, recipientG: policy.recipientG, reason: d.reason, executed: true, arcBurnTx: burnHash, signer: account.address, trigger: trigger })
		await kvDel(LOCK_KEY)
		res.status(200).json({ decision: rec, executed: true, arcBurnTx: burnHash, explorer: ARCSCAN + burnHash, signer: account.address, remainingAvailable: remaining })
	} catch (e) {
		await kvDel(LOCK_KEY)
		const msg = (e && e.shortMessage) || (e && e.message) || "execution failed"
		res.status(500).json({ detail: String(msg).slice(0, 300) })
	}
}

export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
	res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization")
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

	if (action === "execute") {
		await runExecute(req, res, q)
		return
	}

	res.status(400).json({ detail: "unknown action" })
}
