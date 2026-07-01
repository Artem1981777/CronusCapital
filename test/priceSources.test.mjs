import { test } from "node:test"
import assert from "node:assert/strict"
import { parseBase, crossCheckDecision, fetchCoinbaseSpot, crossCheck } from "../lib/priceSources.js"

test("parseBase extracts base asset", () => {
  assert.equal(parseBase("BTC-USDC"), "BTC")
  assert.equal(parseBase("eth-usdt"), "ETH")
  assert.equal(parseBase("SOL"), "SOL")
  assert.equal(parseBase(""), null)
  assert.equal(parseBase(null), null)
})

test("crossCheckDecision computes spread and agreement", () => {
  const d = crossCheckDecision(100, 100.5, 1)
  assert.equal(d.altPrice, 100.5)
  assert.equal(d.spreadPct, 0.5)
  assert.equal(d.agree, true)
  const d2 = crossCheckDecision(100, 103, 1)
  assert.equal(d2.agree, false)
  assert.equal(d2.spreadPct, 3)
})

test("crossCheckDecision handles bad inputs", () => {
  const d = crossCheckDecision(0, 100, 1)
  assert.equal(d.spreadPct, null)
  assert.equal(d.agree, null)
  assert.equal(d.altPrice, 100)
  const d2 = crossCheckDecision(100, NaN, 1)
  assert.equal(d2.altPrice, null)
  assert.equal(d2.agree, null)
})

test("fetchCoinbaseSpot parses amount via injected fetch", async () => {
  const fakeFetch = async () => ({ json: async () => ({ data: { amount: "12345.67" } }) })
  const px = await fetchCoinbaseSpot("BTC-USDC", fakeFetch)
  assert.equal(px, 12345.67)
})

test("fetchCoinbaseSpot returns null on bad payload", async () => {
  const fakeFetch = async () => ({ json: async () => ({ data: {} }) })
  const px = await fetchCoinbaseSpot("BTC", fakeFetch)
  assert.equal(px, null)
})

test("crossCheck combines fetch + decision with injected fetch", async () => {
  const fakeFetch = async () => ({ json: async () => ({ data: { amount: "101" } }) })
  const r = await crossCheck("BTC-USDC", 100, { tolPct: 2, fetchImpl: fakeFetch })
  assert.equal(r.source, "coinbase")
  assert.equal(r.altPrice, 101)
  assert.equal(r.spreadPct, 1)
  assert.equal(r.agree, true)
  assert.equal(r.tolerancePct, 2)
})
