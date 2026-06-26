import { Keypair, Contract, TransactionBuilder, xdr, rpc } from "@stellar/stellar-sdk"

export const config = { maxDuration: 60 }

const FORWARDER = "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ"
const RPC_URL = "https://soroban-testnet.stellar" + ".org"
const PASSPHRASE = "Test SDF Network ; September 2015"
const IRIS = "https://iris-api-sandbox.circle" + ".com"
const FRIENDBOT = "https://friendbot.stellar" + ".org"
const STELLAR_EXPLORER = "https://stellar" + ".expert/explorer/testnet/tx/"
const ARC_DOMAIN = 26
const INCLUSION_FEE = "1000000"
const HASH_RE = /^0x[0-9a-fA-F]{64}$/

const KV_URL = process.env.KV_REST_API_URL || ""
const KV_TOKEN = process.env.KV_REST_API_TOKEN || ""

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
function scvBytesFromHex(hex) { return xdr.ScVal.scvBytes(Buffer.from(hex.replace(/^0x/, ""), "hex")) }

async function fetchT(url, opts, ms) {
	const c = new AbortController()
	const t = setTimeout(function () { c.abort() }, ms || 8000)
	try {
		const merged = Object.assign({}, opts || {}, { signal: c.signal })
		return await fetch(url, merged)
	} finally { clearTimeout(t) }
}

async function kvCmd(path) {
	if (!KV_URL || !KV_TOKEN) return null
	try {
		const r = await fetchT(KV_URL + path, { headers: { Authorization: "Bearer " + KV_TOKEN } }, 4000)
		if (!r.ok) return null
		const j = await r.json()
		return j.result
	} catch { return null }
}
async function kvGet(key) { return await kvCmd("/get/" + encodeURIComponent(key)) }
async function kvSetEx(key, val, ttl) {
	return await kvCmd("/set/" + encodeURIComponent(key) + "/" + encodeURIComponent(val) + "?EX=" + ttl)
}
async function kvIncrEx(key, ttl) {
	const n = await kvCmd("/incr/" + encodeURIComponent(key))
	if (n === 1) await kvCmd("/expire/" + encodeURIComponent(key) + "/" + ttl)
	return n
}

async function getAttestation(txHash) {
	const url = IRIS + "/v2/messages/" + ARC_DOMAIN + "?transactionHash=" + txHash
	const r = await fetchT(url, {}, 8000)
	if (!r.ok) return { ok: false, code: r.status }
	const j = await r.json()
	const msg = j && j.messages && j.messages[0]
	return { ok: true, msg: msg }
}

function clientIp(req) {
	const xf = req.headers["x-forwarded-for"]
	if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim()
	return "unknown"
}

export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS")
	res.setHeader("Access-Control-Allow-Headers", "Content-Type")
	if (req.method === "OPTIONS") { res.status(200).end(); return }

	const txHash = (req.query && req.query.txHash) || (req.body && req.body.txHash) || ""
	if (!HASH_RE.test(txHash)) { res.status(400).json({ status: "bad_request", detail: "invalid txHash" }); return }

	const ip = clientIp(req)
	const rl = await kvIncrEx("rl:complete:" + ip, 60)
	if (typeof rl === "number" && rl > 10) {
		res.status(429).json({ status: "rate_limited", detail: "too many requests, retry in a minute" }); return
	}

	const cacheKey = "complete:" + txHash
	const cached = await kvGet(cacheKey)
	if (cached) {
		try {
			const c = JSON.parse(cached)
			res.status(200).json(Object.assign({ cached: true }, c)); return
		} catch {}
	}

	const att = await getAttestation(txHash)
	if (!att.ok) { res.status(502).json({ status: "iris_error", code: att.code }); return }
	const m = att.msg
	if (!m || m.status !== "complete" || !m.message || !m.attestation || m.attestation === "PENDING") {
		res.status(200).json({ status: "pending", detail: "attestation not ready, retry shortly" }); return
	}

	let kp = null
	const envSecret = process.env.RELAYER_SECRET || ""
	if (envSecret) {
		try { kp = Keypair.fromSecret(envSecret) } catch { kp = null }
	}
	let ephemeral = false
	if (!kp) {
		kp = Keypair.random()
		ephemeral = true
		const fb = await fetchT(FRIENDBOT + "/?addr=" + kp.publicKey(), {}, 10000)
		if (!fb.ok) { res.status(502).json({ status: "fund_failed" }); return }
	}

	const server = new rpc.Server(RPC_URL)
	let account = null
	for (let i = 0; i < 10; i++) {
		try { account = await server.getAccount(kp.publicKey()); break } catch { await sleep(1500) }
	}
	if (!account) { res.status(504).json({ status: "account_not_ready" }); return }

	const contract = new Contract(FORWARDER)
	const op = contract.call("mint_and_forward", scvBytesFromHex(m.message), scvBytesFromHex(m.attestation))
	let tx = new TransactionBuilder(account, { fee: INCLUSION_FEE, networkPassphrase: PASSPHRASE })
		.addOperation(op).setTimeout(120).build()

	let sim
	try { sim = await server.simulateTransaction(tx) } catch (e) { sim = { error: String(e) } }
	if (rpc.Api.isSimulationError(sim)) {
		const detail = String(sim.error || "")
		if (/already|used|nonce|exists|replay/i.test(detail)) {
			const done = { status: "already_completed", detail: "this burn was already minted on Stellar" }
			await kvSetEx(cacheKey, JSON.stringify(done), 86400)
			res.status(200).json(done); return
		}
		res.status(500).json({ status: "sim_failed", detail: detail }); return
	}

	tx = rpc.assembleTransaction(tx, sim).build()
	tx.sign(kp)

	let sent
	try { sent = await server.sendTransaction(tx) } catch (e) { res.status(500).json({ status: "send_failed", detail: String(e) }); return }
	if (sent.status === "ERROR") { res.status(500).json({ status: "send_failed", detail: JSON.stringify(sent.errorResult || sent) }); return }

	let got = null
	for (let i = 0; i < 20; i++) {
		await sleep(2000)
		try {
			const g = await server.getTransaction(sent.hash)
			if (g.status !== "NOT_FOUND") { got = g; break }
		} catch {}
	}
	if (!got || got.status !== "SUCCESS") {
		res.status(500).json({ status: "tx_failed", detail: got ? got.status : "timeout", stellarTxHash: sent.hash }); return
	}

	const result = {
		status: "success",
		stellarTxHash: sent.hash,
		explorer: STELLAR_EXPLORER + sent.hash,
		relayer: ephemeral ? "ephemeral" : "env",
	}
	await kvSetEx(cacheKey, JSON.stringify(result), 86400)
	res.status(200).json(result)
}
