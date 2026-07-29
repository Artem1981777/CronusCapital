// Offline check of FactGuard: the network is stubbed via fetchImpl, the result is deterministic.
import assert from "node:assert/strict"
import { guard, decide, extractClaims, classify } from "../lib/factGuard.js"

const REF = 100000
const fake = (px) => async () => ({ json: async () => ({ data: { amount: String(px) } }) })
const boom = async () => { throw new Error("network down") }
const clean = { verdict: "long", spotPrice: 100000, targetPrice: 110000, stopLoss: 97000 }
const ok = { fetchImpl: fake(100050) }
let n = 0

const cases = [
  ["the substring trap: spotPrice is an observation, not a forecast", async () => {
    assert.equal(classify("spotPrice"), "observational")
    assert.equal(classify("entry_price"), "observational")
    assert.equal(classify("targetPrice"), "forward")
    assert.equal(classify("stopLoss"), "forward")
    assert.equal(classify("tp"), "forward")
    assert.equal(classify("takeProfit"), "forward")
    assert.equal(classify("conviction"), null)
  }],
  ["clean output passes, and the check actually checks something", async () => {
    const r = await guard({ instId: "BTC-USDC", okxPrice: REF, output: clean, opts: ok })
    assert.equal(r.ok, true, JSON.stringify(r.violations))
    assert.equal(r.severity, "clean")
    assert.equal(r.corroboration.agree, true)
    assert.equal(r.checked, 3)
    assert.equal(r.observed, 1)
  }],
  ["an invented spot price is fabrication", async () => {
    const r = await guard({ instId: "BTC-USDC", okxPrice: REF, output: { ...clean, spotPrice: 95000 }, opts: ok })
    assert.equal(r.ok, false)
    assert.equal(r.severity, "fabrication")
    assert.equal(r.violations[0].code, "fabricated_observation")
    assert.equal(r.violations[0].deviationBps, 500)
  }],
  ["an observation within 25 bps passes", async () => {
    const r = await guard({ instId: "BTC-USDC", okxPrice: REF, output: { ...clean, spotPrice: 100200 }, opts: ok })
    assert.equal(r.ok, true, JSON.stringify(r.violations))
  }],
  ["a wrong forecast is NOT a violation", async () => {
    const r = await guard({ instId: "BTC-USDC", okxPrice: REF, output: { ...clean, targetPrice: 124000 }, opts: ok })
    assert.equal(r.ok, true, JSON.stringify(r.violations))
  }],
  ["an absurd forecast is caught", async () => {
    const r = await guard({ instId: "BTC-USDC", okxPrice: REF, output: { ...clean, targetPrice: 900000 }, opts: ok })
    assert.equal(r.violations.some((v) => v.code === "implausible_forecast"), true)
  }],
  ["disagreeing sources block", async () => {
    const r = await guard({ instId: "BTC-USDC", okxPrice: REF, output: clean, opts: { fetchImpl: fake(112000) } })
    assert.equal(r.ok, false)
    assert.equal(r.violations.some((v) => v.code === "sources_disagree"), true)
    assert.equal(r.severity, "unverifiable")
  }],
  ["fail-CLOSED: the second source is unavailable => denied", async () => {
    const r = await guard({ instId: "BTC-USDC", okxPrice: REF, output: clean, opts: { fetchImpl: boom } })
    assert.equal(r.ok, false)
    assert.equal(r.violations.some((v) => v.code === "corroboration_unavailable"), true)
  }],
  ["no reference price => denied", async () => {
    const r = await guard({ instId: "BTC-USDC", okxPrice: null, output: clean, opts: ok })
    assert.equal(r.violations.some((v) => v.code === "reference_price_unavailable"), true)
  }],
  ["nested and stringified numbers are found", async () => {
    const c = extractClaims({ a: { b: { entry: "100000" } }, legs: [{ targetPrice: 110000 }] })
    assert.equal(c.length, 2)
    assert.equal(c.find((x) => x.key === "entry").kind, "observational")
    assert.equal(c.find((x) => x.key === "targetPrice").kind, "forward")
  }],
  ["prose and non-price numbers are ignored", async () => {
    assert.equal(extractClaims({ conviction: 70, latencyMs: 42, note: "price will rise" }).length, 0)
  }],
  ["determinism", async () => {
    const mk = () => decide({ claims: extractClaims(clean), refPrice: REF, corroboration: { agree: true, source: "coinbase", spreadPct: 0.05 } })
    assert.equal(JSON.stringify(mk()), JSON.stringify(mk()))
  }],
]
for (const [name, fn] of cases) { await fn(); n += 1; console.log("  ok - " + name) }
console.log("\nFactGuard: " + n + "/" + cases.length + " passed")
