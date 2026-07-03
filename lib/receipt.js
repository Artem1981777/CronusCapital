// api/receipt.js (served via /api/info?kind=receipt&tx=0x...) — one verifiable x402 receipt.
// Binds a single payment to its on-chain proof: payer -> amount -> HTTP 402 price -> commitment.
// Re-verifies the tx live on the Arc explorer: a real USDC transfer of the exact signal
// price to the treasury. Read-only, no keys, fail-open.
const USDC = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase()
const PAY_TO = (process.env.CRONUS_PAYTO || "0xdc6778C5F8cC74b10aED11c48306D4Cfc5737FBD").toLowerCase()
const PRICE = String(process.env.SIGNAL_PRICE || "20000")
const EXPLORER = process.env.ARC_EXPLORER || "https://testnet.arcscan.app"
const KNOWN = {
	"0xfe2764b2b837365ea7cb896fbbe55119ffbf250e51941945bf013a88bb942086": { kind: "x402-signal", commitment: "0x993453223b57849b38df20ff050daa54905d53a3ac70c56c8e5460eb6fa77611", memoId: null },
	"0xa7a0e3b25394d2c0570be62605f0a379b1a0e5d1ba2e7607f719fbd1ca9943d5": { kind: "x402-signal-memo", commitment: "0xc9acbd88b845a248e3ee669cca257f2e64f8c1daf17f64063d7765bfeae60680", memoId: "0x30c32e7e09b43cee3059b3d8136b591fda8c61d7840cff45911c60ee04e19d46" },
}
async function fetchExplorer() {
	const u = EXPLORER + "/api?module=account&action=tokentx&address=" + PAY_TO + "&contractaddress=" + USDC + "&page=1&offset=10000&sort=desc"
	const r = await fetch(u, { headers: { accept: "application/json" } })
	const j = await r.json()
	if (!j || !Array.isArray(j.result)) throw new Error("explorer: no result array")
	return j.result
}
export default async function handler(req, res) {
	res.setHeader("access-control-allow-origin", "*")
	res.setHeader("access-control-allow-methods", "GET, OPTIONS")
	if (req.method === "OPTIONS") { res.status(204).end(); return }
	const raw = (req.query && (req.query.tx || req.query.hash)) ? String(req.query.tx || req.query.hash) : ""
	const tx = raw.trim().toLowerCase()
	if (!/^0x[0-9a-f]{64}$/.test(tx)) {
		res.setHeader("content-type", "application/json")
		res.status(400).json({ ok: false, error: "missing or invalid tx (expected 0x + 64 hex chars)", usage: "/api/info?kind=receipt&tx=0x<64hex>" })
		return
	}
	const priceUsdc = Number(PRICE) / 1000000
	const k = KNOWN[tx] || null
	try {
		let row = null
		try {
			const rows = await fetchExplorer()
			for (const t of rows) { if (String(t.hash).toLowerCase() === tx) { row = t; break } }
		} catch (e) { /* explorer down -> fallback below */ }
		if (!row) {
			res.setHeader("content-type", "application/json")
			res.status(200).json({
				ok: true,
				verified: false,
				txHash: tx,
				network: "arc-testnet",
				payTo: PAY_TO,
				reason: k ? "explorer unavailable; commitment served from known-proof fallback" : "tx not found among treasury USDC transfers at the signal price (may be unrelated, pending, or explorer lag)",
				commitment: k ? k.commitment : null,
				memoId: k ? k.memoId : null,
				nonCustodial: true,
				explorer: EXPLORER + "/tx/" + tx,
				verify: { allReceipts: "/api/receipts", trace: "/api/trace", trackRecord: "/api/track-record", metrics: "/api/metrics" },
				updatedAt: new Date().toISOString(),
			})
			return
		}
		const to = String(row.to || "").toLowerCase()
		const contract = String(row.contractAddress || "").toLowerCase()
		const value = String(row.value)
		const toTreasury = to === PAY_TO
		const isUsdc = contract === USDC
		const priceMatches = value === PRICE
		const verified = toTreasury && isUsdc && priceMatches
		const atomic = Number(row.value)
		res.setHeader("content-type", "application/json")
		res.setHeader("cache-control", "s-maxage=60, stale-while-revalidate=300")
		res.status(200).json({
			ok: true,
			verified: verified,
			txHash: row.hash,
			kind: (k && k.kind) || "x402-signal",
			network: "arc-testnet",
			asset: "USDC",
			http402: { challenge: "HTTP 402 at /api/signal", priceAtomic: PRICE, priceUsdc: priceUsdc, asset: "USDC", payTo: PAY_TO },
			payer: String(row.from || "").toLowerCase(),
			payTo: PAY_TO,
			amountAtomic: atomic,
			amountUsdc: atomic / 1000000,
			priceMatches: priceMatches,
			toTreasury: toTreasury,
			isUsdc: isUsdc,
			block: row.blockNumber ? Number(row.blockNumber) : null,
			settledAt: row.timeStamp ? new Date(Number(row.timeStamp) * 1000).toISOString() : null,
			settled: true,
			commitment: k ? k.commitment : null,
			memoId: k ? k.memoId : null,
			nonCustodial: true,
			custodyNote: "Spend-path settlement is signed in the payer's own wallet; the agent holds no key on the buy side.",
			explorer: EXPLORER + "/tx/" + row.hash,
			verify: { allReceipts: "/api/receipts", trace: "/api/trace", trackRecord: "/api/track-record", metrics: "/api/metrics" },
			updatedAt: new Date().toISOString(),
		})
	} catch (e) {
		res.setHeader("content-type", "application/json")
		res.status(200).json({ ok: false, error: String((e && e.message) || e), txHash: tx, payTo: PAY_TO })
	}
}
