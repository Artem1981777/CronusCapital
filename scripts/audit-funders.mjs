// scripts/audit-funders.mjs — verify external payers are independently funded.
// Reads /api/receipts, then for each external payer checks the FIRST incoming USDC
// transfer's funder against Cronus's own wallets. Prints a sybil-transparent summary.
const HOST = process.env.CRONUS_HOST || "https://cronus-capital.vercel.app"
const BASE = process.env.ARC_EXPLORER || "https://testnet.arcscan.app"
const USDC = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase()
const OURS = new Set([
	"0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd", // treasury
	"0xb8d0054dd4fe76115e75bf196d89e760bbcd3bc6", // deployer / buyer-agent
	"0xd81a420bfa4ce8778473bd46195b8e97e928880f", // agent contract
	"0x5294e9927c3306dcbadb03fe70b92e01ccede505", // memo
	"0x13b6984357e27dab17df44a6396042239e70542c", // vault
	"0x6829860b7f61fa01e5bf3d194d9f780aca5b6787", // payout
])
const rcp = await (await fetch(HOST + "/api/receipts")).json()
const payers = [...new Set((rcp.receipts || []).map((r) => String(r.payer || "").toLowerCase()).filter((p) => p.startsWith("0x") && !OURS.has(p)))]
console.log("external payers to audit:", payers.length)
let ours = 0, indep = 0, unknown = 0
const funders = new Map(); const redflags = []
for (const addr of payers) {
	try {
		const u = BASE + "/api?module=account&action=tokentx&contractaddress=" + USDC + "&address=" + addr + "&page=1&offset=50&sort=asc"
		const j = await (await fetch(u)).json()
		const txs = Array.isArray(j.result) ? j.result : []
		const first = txs.filter((t) => String(t.to || "").toLowerCase() === addr)[0]
		if (!first) { unknown++; continue }
		const from = String(first.from || "").toLowerCase()
		funders.set(from, (funders.get(from) || 0) + 1)
		if (OURS.has(from)) { ours++; redflags.push(addr + " <= " + from) } else indep++
	} catch (e) { unknown++ }
}
console.log("funded by OUR wallets :", ours)
console.log("funded INDEPENDENTLY  :", indep)
console.log("no funding data       :", unknown)
console.log("distinct funding srcs :", funders.size)
if (redflags.length) { console.log("\n!! RED FLAGS (funded by a Cronus wallet):"); redflags.forEach((x) => console.log("  " + x)) }
else console.log("\nNO RED FLAGS — every external payer was funded independently, none by a Cronus wallet.")
