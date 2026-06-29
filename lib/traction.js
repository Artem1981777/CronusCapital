// lib/traction.js — honest nano-payment traction for Cronus Capital.
// Pure reducers (unit-tested) + Upstash/Vercel-KV reads + /api/traction handler.
// Routed publicly as /api/traction via vercel.json -> /api/info?kind=traction.

const TREASURY = (process.env.CRONUS_PAYTO || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd").toLowerCase()

// Addresses treated as "self": our treasury + any self-funded demo wallets (e.g. the autonomous
// buyer-agent). Honest: EXCLUDED from unique_external_payers/leaderboard; counted as self_demo_calls.
export function selfAddresses() {
	const extra = String(process.env.SELF_DEMO_ADDRESSES || "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean)
	const infra = [
		"0xb8d0054dd4fe76115e75bf196d89e760bbcd3bc6", // deployer / buyer-agent
		"0xd81a420bfa4ce8778473bd46195b8e97e928880f", // x402 agent contract
		"0x5294e9927c3306dcbadb03fe70b92e01ccede505", // memo contract
		"0x13b6984357e27dab17df44a6396042239e70542c", // vault
		"0x6829860b7f61fa01e5bf3d194d9f780aca5b6787", // payout treasury
	]
	return [...new Set([TREASURY, ...infra, ...extra])]
}

// --- pure: fold the nano ledger into headline traction metrics ---
// Honest separation: unique_external_payers EXCLUDES our treasury / self volume.
export function reduceTraction(ledger, { exclude = [] } = {}) {
	const ex = new Set(exclude.map((a) => String(a).toLowerCase()))
	const payers = new Set()
	const settlements = new Set()
	let micros = 0n
	let calls = 0
	for (const e of ledger) {
		calls++
		if (e.amount) micros += BigInt(e.amount)
		if (e.transaction) settlements.add(e.transaction)
		const p = e.payer ? String(e.payer).toLowerCase() : null
		if (p && !ex.has(p)) payers.add(p)
	}
	return {
		total_calls: calls,
		unique_external_payers: payers.size,
		nano_micros: micros.toString(),
		settlement_count: settlements.size,
		batch_ratio: settlements.size ? Number((calls / settlements.size).toFixed(2)) : 0,
	}
}

// --- pure: per-payer leaderboard, treasury/self excluded, sorted by volume ---
export function leaderboard(ledger, { exclude = [], limit = 10 } = {}) {
	const ex = new Set(exclude.map((a) => String(a).toLowerCase()))
	const map = new Map()
	for (const e of ledger) {
		const p = e.payer ? String(e.payer).toLowerCase() : null
		if (!p || ex.has(p)) continue
		const cur = map.get(p) || { payer: p, calls: 0, micros: 0n, settlements: new Set() }
		cur.calls++
		if (e.amount) cur.micros += BigInt(e.amount)
		if (e.transaction) cur.settlements.add(e.transaction)
		map.set(p, cur)
	}
	return [...map.values()]
		.map((r) => ({ payer: r.payer, calls: r.calls, micros: r.micros.toString(), usdc: Number(r.micros) / 1e6, settlements: r.settlements.size }))
		.sort((a, b) => (BigInt(b.micros) > BigInt(a.micros) ? 1 : BigInt(b.micros) < BigInt(a.micros) ? -1 : b.calls - a.calls))
		.slice(0, Math.max(1, limit))
}

// --- pure: fold on-chain USDC receipts into honest external-payer metrics ---
// Honest: excludes treasury + our own infra/demo wallets (selfAddresses()).
export function reduceOnchainPayers(receipts, { exclude = [] } = {}) {
	const ex = new Set(exclude.map((a) => String(a).toLowerCase()))
	const payers = new Map()
	let extTxs = 0
	let extMicros = 0
	let selfTxs = 0
	for (const r of receipts || []) {
		const p = r && r.payer ? String(r.payer).toLowerCase() : null
		const micros = Number((r && r.amountAtomic) || 0)
		if (!p) continue
		if (ex.has(p)) { selfTxs++; continue }
		extTxs++
		extMicros += micros
		const cur = payers.get(p) || { payer: p, txs: 0, micros: 0 }
		cur.txs++
		cur.micros += micros
		payers.set(p, cur)
	}
	const leaders = [...payers.values()]
		.map((x) => ({ payer: x.payer, txs: x.txs, usdc: Number(x.micros) / 1e6 }))
		.sort((a, b) => b.usdc - a.usdc || b.txs - a.txs)
	return {
		onchain_external_payers: payers.size,
		onchain_external_txs: extTxs,
		onchain_external_usdc: Math.round((extMicros / 1e6) * 1e6) / 1e6,
		onchain_self_txs: selfTxs,
		onchain_leaders: leaders,
	}
}

// --- fetch the public on-chain receipts feed (same deployment) ---
export async function readReceipts(host) {
	try {
		const h = host || "localhost"
		const r = await fetch("https://" + h + "/api/receipts")
		if (!r.ok) return []
		const j = await r.json()
		return Array.isArray(j && j.receipts) ? j.receipts : []
	} catch (_) { return [] }
}

// --- Upstash/Vercel-KV REST (no-op if env absent), same contract as api/nano-signal.js ---
async function kv(cmd) {
	const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
	const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
	if (!base || !token) return null
	try {
		const r = await fetch(base, { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(cmd) })
		const j = await r.json()
		return j && j.result
	} catch (_) {
		return null
	}
}

export async function readNanoLedger() {
	const raw = await kv(["LRANGE", "cronus:nano:ledger", "0", "199"])
	if (!Array.isArray(raw)) return []
	const out = []
	for (const s of raw) {
		try { out.push(typeof s === "string" ? JSON.parse(s) : s) } catch (_) {}
	}
	return out
}

export { TREASURY }

// --- /api/traction handler: nano (KV) + standard (on-chain via /api/metrics) ---
export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120")
	try {
		const ledger = await readNanoLedger()
		const nano = reduceTraction(ledger, { exclude: selfAddresses() })
		const selfDemoCalls = (() => { const self = new Set(selfAddresses()); return ledger.filter((e) => self.has(String(e.payer || "").toLowerCase())).length })()
		let standard = null
				let onchain = null
		try {
			const host = (req.headers && req.headers.host) || "localhost"
			const r = await fetch("https://" + host + "/api/metrics")
			if (r.ok) standard = await r.json()
					try { const rc = await readReceipts(host); onchain = reduceOnchainPayers(rc, { exclude: selfAddresses() }) } catch (_) {}
		} catch (_) {}
		res.status(200).json({
				external_payers: 0,
				external_txs: 0,
				external_usdc: 0,
					self_generated_wallets: onchain ? onchain.onchain_external_payers : 0,
					self_generated_txs: onchain ? onchain.onchain_external_txs : 0,
					self_generated_usdc: onchain ? onchain.onchain_external_usdc : 0,
				canonical_field: "external_payers",
				headline_note: "HONEST: external_payers = 0. No verified third-party payer yet. Every on-chain x402 settlement so far is self-generated test traffic (self_generated_*), produced by us across dev sessions to prove the paywall settles real USDC on Arc end-to-end. We never count our own test volume as external demand.",
			ok: true,
			network: process.env.X402_NETWORK || "arc-testnet",
			treasury: TREASURY,
			nano: {
				...nano,
				nano_usdc: Number(BigInt(nano.nano_micros)) / 1e6,
				self_demo_calls: selfDemoCalls,
				note: "unique_external_payers excludes treasury/self; self_demo_calls = honestly-labeled autonomous A2A demo volume",
			},
			standard: standard ? { payments: standard.payments, totalUsdc: standard.totalUsdc, lastTx: standard.lastTx, source: standard.source } : null,
					self_generated: onchain ? { wallets: onchain.onchain_external_payers, txs: onchain.onchain_external_txs, usdc: onchain.onchain_external_usdc, note: "self-generated test traffic: distinct wallets we used across dev sessions to exercise the live x402 paywall; NOT external customers; verify on Arc explorer" } : null,
			updatedAt: new Date().toISOString(),
		})
	} catch (e) {
		res.status(502).json({ ok: false, error: String((e && e.message) || e) })
	}
}
