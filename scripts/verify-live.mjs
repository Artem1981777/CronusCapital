// Cronus Capital — live, no-secret verifier.
// Verifies the live deployment end-to-end with zero private keys.
// Run: npm run verify-live   (override base/RPC via CRONUS_BASE / ARC_RPC)
const BASE = process.env.CRONUS_BASE || "https://cronus-capital.vercel.app"
const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const USDC = "0x3600000000000000000000000000000000000000"
const PAY_TO = "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd"

let pass = 0, fail = 0
function ok(name, cond, detail) {
	const line = (cond ? "  PASS  " : "  FAIL  ") + name + (detail ? " — " + detail : "")
	if (cond) pass++; else fail++
	console.log(line)
}
async function getJson(path, opts) {
	try {
		const res = await fetch(BASE + path, opts)
		let body = null
		try { body = await res.json() } catch (e) {}
		return { status: res.status, body }
	} catch (e) { return { status: 0, body: null } }
}
async function rpc(method, params) {
	try {
		const res = await fetch(RPC, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }),
		})
		const j = await res.json()
		return j.result
	} catch (e) { return null }
}

console.log("Cronus Capital — live verifier (no private keys required)")
console.log("base: " + BASE)

console.log("\n[1] x402 paywall (GET /api/signal, no payment)")
{
	const r = await getJson("/api/signal?topic=BTC")
	ok("returns HTTP 402", r.status === 402, "got " + r.status)
	const a = r.body && Array.isArray(r.body.accepts) ? r.body.accepts[0] : null
	ok("advertises an x402 offer", !!a)
	ok("price is 20000 atomic USDC (0.02)", !!a && a.maxAmountRequired === "20000")
	ok("payTo is the treasury", !!a && String(a.payTo).toLowerCase() === PAY_TO)
	ok("asset is Arc USDC", !!a && String(a.asset).toLowerCase() === USDC)
	ok("network is arc-testnet", !!a && a.network === "arc-testnet")
	ok("embeds discovery (manifest/openapi/receipts)", !!(r.body && r.body.discovery && r.body.discovery.manifest && r.body.discovery.openapi))
}

console.log("\n[2] service manifest (GET /api/manifest)")
{
	const r = await getJson("/api/manifest")
	ok("HTTP 200", r.status === 200)
	ok("protocol x402", !!r.body && r.body.protocol === "x402")
	ok("chainId 5042002 (Arc testnet)", !!(r.body && r.body.network) && r.body.network.chainId === 5042002)
	ok("ERC-8004 identity registry", !!(r.body && r.body.identityRegistry) && r.body.identityRegistry.standard === "ERC-8004")
	ok("payment rails include x402-exact", !!r.body && Array.isArray(r.body.paymentRails) && r.body.paymentRails.includes("x402-exact"))
}

console.log("\n[3] OpenAPI discovery (GET /api/openapi)")
{
	const r = await getJson("/api/openapi")
	ok("HTTP 200", r.status === 200)
	ok("valid OpenAPI 3.x", !!r.body && typeof r.body.openapi === "string" && r.body.openapi.indexOf("3.") === 0)
	ok("documents paths", !!(r.body && r.body.paths) && Object.keys(r.body.paths).length > 0)
}

console.log("\n[4] public receipts + metrics agree")
{
	const r = await getJson("/api/receipts")
	const m = await getJson("/api/metrics")
	ok("receipts ok", !!r.body && r.body.ok === true)
	ok("metrics ok", !!m.body && m.body.ok === true)
	ok("count matches metrics payments", !!(r.body && m.body) && r.body.count === m.body.payments, "receipts=" + (r.body && r.body.count) + " metrics=" + (m.body && m.body.payments))
	ok("every receipt = 0.02 USDC to treasury", !!r.body && Array.isArray(r.body.receipts) && r.body.receipts.length > 0 && r.body.receipts.every(function (x) { return String(x.payTo).toLowerCase() === PAY_TO && x.amountAtomic === 20000 }))
	ok("metrics read from on-chain explorer", !!m.body && m.body.source === "onchain-explorer")
}

console.log("\n[5] honesty invariants (traction + leaderboard)")
{
	const t = await getJson("/api/traction")
	const l = await getJson("/api/leaderboard")
	ok("traction external_payers == 0", !!t.body && t.body.external_payers === 0)
	ok("traction external_usdc == 0", !!t.body && t.body.external_usdc === 0)
	ok("self-generated volume is labeled, not hidden", !!t.body && typeof t.body.self_generated_txs === "number")
	ok("leaderboard external_payers == 0", !!l.body && l.body.external_payers === 0)
	ok("leaderboard external_leaders is empty", !!l.body && Array.isArray(l.body.external_leaders) && l.body.external_leaders.length === 0)
}

console.log("\n[6] on-chain confirmation (Arc RPC, no ABI, no keys)")
{
	const m = await getJson("/api/metrics")
	const tx = m.body && m.body.lastTx
	ok("metrics exposes a settlement tx", !!tx, tx || "")
	if (tx) {
		const rec = await rpc("eth_getTransactionReceipt", [tx])
		ok("tx is on-chain", !!rec, tx)
		ok("tx succeeded (status 0x1)", !!rec && rec.status === "0x1")
		ok("emits a USDC transfer event", !!rec && Array.isArray(rec.logs) && rec.logs.some(function (g) { return String(g.address).toLowerCase() === USDC }))
	}
}

console.log("\n================================================")
console.log((fail === 0 ? "ALL CHECKS PASSED" : fail + " CHECK(S) FAILED") + " — " + pass + " passed, " + fail + " failed")
console.log("No private keys were used. Reproduce: npm run verify-live")
process.exit(fail === 0 ? 0 : 1)
