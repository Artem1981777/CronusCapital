import { test } from "node:test"
import assert from "node:assert/strict"

// --- mirrors @circle-fin/x402-batching parsePrice (USDC 6dp) ---
function parsePrice(price) {
  const n = parseFloat(String(price).replace(/[$ ]/g, ""))
  if (isNaN(n) || n <= 0) throw new Error("bad price")
  return Math.round(n * 1_000_000).toString()
}

// --- pure traction reducer (reused by /api/traction on P3) ---
// Honest separation: external payers EXCLUDE our treasury / self-generated volume.
function reduceTraction(ledger, { exclude = [] } = {}) {
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

test("nano-signal module loads and exports a handler", async () => {
  const m = await import("../api/nano-signal.js")
  assert.equal(typeof m.default, "function")
})

test("NANO price parses to 1000 atomic USDC (0.001)", () => {
  assert.equal(parsePrice("$0.001"), "1000")
  assert.equal(parsePrice("0.001"), "1000")
})

test("STANDARD + sub-cent floor parse correctly", () => {
  assert.equal(parsePrice("$0.02"), "20000")     // STANDARD tier
  assert.equal(parsePrice("0.000001"), "1")      // 1 micro-USDC floor
})

test("rejects non-positive / garbage prices", () => {
  assert.throws(() => parsePrice("$0"))
  assert.throws(() => parsePrice("abc"))
})

test("traction excludes treasury/self; counts only real external payers", () => {
  const TREASURY = "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd"
  const ledger = [
    { payer: TREASURY,  amount: "1000", transaction: "0xbatchA" }, // self -> excluded
    { payer: "0xAAAA",  amount: "1000", transaction: "0xbatchA" }, // external #1
    { payer: "0xBBBB",  amount: "1000", transaction: "0xbatchA" }, // external #2
    { payer: "0xAAAA",  amount: "1000", transaction: "0xbatchB" }, // external #1 again
    { payer: TREASURY,  amount: "1000", transaction: "0xbatchB" }, // self -> excluded
    { payer: "0xCCCC",  amount: "1000", transaction: "0xbatchB" }, // external #3
  ]
  const t = reduceTraction(ledger, { exclude: [TREASURY] })
  assert.equal(t.total_calls, 6)
  assert.equal(t.unique_external_payers, 3)          // AAAA, BBBB, CCCC
  assert.equal(t.nano_micros, "6000")                // 6 * 1000
  assert.equal(t.settlement_count, 2)                // batchA, batchB
  assert.equal(t.batch_ratio, 3)                     // 6 calls / 2 settlements -> 3:1 batching
})

test("empty ledger is safe", () => {
  const t = reduceTraction([])
  assert.equal(t.total_calls, 0)
  assert.equal(t.unique_external_payers, 0)
  assert.equal(t.settlement_count, 0)
  assert.equal(t.batch_ratio, 0)
})
