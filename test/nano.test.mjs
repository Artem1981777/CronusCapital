import { test } from "node:test"
import assert from "node:assert/strict"
import { reduceTraction } from "../lib/traction.js"

// --- mirrors @circle-fin/x402-batching parsePrice (USDC 6dp) ---
function parsePrice(price) {
	const n = parseFloat(String(price).replace(/[$ ]/g, ""))
	if (isNaN(n) || n <= 0) throw new Error("bad price")
	return Math.round(n * 1_000_000).toString()
}

test("nano-signal module loads and exports a handler", async () => {
	const m = await import("../api/nano-signal.js")
	assert.equal(typeof m.default, "function")
})

test("NANO price parses to 1000 atomic USDC (0.001)", () => {
	assert.equal(parsePrice("$0.001"), "1000")
	assert.equal(parsePrice("0.001"), "1000")
})

test("STANDARD + sub-cent floor parse correctly", () => {
	assert.equal(parsePrice("$0.02"), "20000")
	assert.equal(parsePrice("0.000001"), "1")
})

test("rejects non-positive / garbage prices", () => {
	assert.throws(() => parsePrice("$0"))
	assert.throws(() => parsePrice("abc"))
})

test("traction excludes treasury/self; counts only real external payers", () => {
	const TREASURY = "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd"
	const ledger = [
		{ payer: TREASURY, amount: "1000", transaction: "0xbatchA" },
		{ payer: "0xAAAA", amount: "1000", transaction: "0xbatchA" },
		{ payer: "0xBBBB", amount: "1000", transaction: "0xbatchA" },
		{ payer: "0xAAAA", amount: "1000", transaction: "0xbatchB" },
		{ payer: TREASURY, amount: "1000", transaction: "0xbatchB" },
		{ payer: "0xCCCC", amount: "1000", transaction: "0xbatchB" },
	]
	const t = reduceTraction(ledger, { exclude: [TREASURY] })
	assert.equal(t.total_calls, 6)
	assert.equal(t.unique_external_payers, 3)
	assert.equal(t.nano_micros, "6000")
	assert.equal(t.settlement_count, 2)
	assert.equal(t.batch_ratio, 3)
})

test("empty ledger is safe", () => {
	const t = reduceTraction([])
	assert.equal(t.total_calls, 0)
	assert.equal(t.unique_external_payers, 0)
	assert.equal(t.settlement_count, 0)
	assert.equal(t.batch_ratio, 0)
})
