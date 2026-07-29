import assert from "node:assert/strict"
import {
  makeLiveThompson, purchaseHistory, clampDiagnosis, seededRandom, withSeededRandom, readReceipts,
} from "../lib/provenance/liveThompson.js"
import { REAL_ROUTES } from "../lib/council/routes.js"
import { PROVENANCE_ROUTES } from "../lib/provenance/routes.js"

const R = [
  { payer: "0xAAA", amountUsdc: 0.02 }, { payer: "0xaaa", amountUsdc: 0.02 },
  { payer: "0xaaa", amountUsdc: 0.01 }, { payer: "0xBBB", amountUsdc: 0.02 },
  { payer: "0x46213abeca58cc9a89a269fd25a8737c700ca164", amountUsdc: 0.02 },
]
const feed = (payload) => async () => ({ json: async () => payload })
const okFeed = feed({ ok: true, count: R.length, totalUsdc: 0.09, receipts: R })
const call = async (h, query) => {
  let out = null
  const res = { setHeader(){}, status(){ return res }, json(j){ out = j; return j } }
  await h({ query: query || {}, method: "GET" }, res)
  return out
}
let n = 0
const cases = [
  ["the price is provably constant: the posterior changes nothing", async () => {
    const d = clampDiagnosis(0.001)
    assert.equal(d.constant, true)
    assert.equal(d.value, 0.0009)
    assert.equal(d.reason, "base_price_at_or_above_cap")
    assert.equal(clampDiagnosis(0.0004).constant, false)
  }],
  ["purchases are counted from real receipts, address case does not matter", async () => {
    const h = purchaseHistory(R, "0xaaa", [])
    assert.equal(h.purchases, 3)
    assert.equal(h.spentUsdc, 0.05)
    assert.equal(h.distinctPayers, 3)
  }],
  ["the project's own wallet is flagged", async () => {
    const h = purchaseHistory(R, "0x46213abeca58cc9a89a269fd25a8737c700ca164", ["0x46213abeca58cc9a89a269fd25a8737c700ca164"])
    assert.equal(h.selfGenerated, true)
    assert.equal(h.externalPayers, 2)
  }],
  ["with no payer address, refuse to compute", async () => {
    const out = await call(makeLiveThompson({ env: {}, fetchImpl: okFeed }), {})
    assert.equal(out.ok, false)
    assert.equal(out.reason, "payer_required")
  }],
  ["receipts unavailable => refusal, nothing substituted", async () => {
    const bad = async () => { throw new Error("network unavailable") }
    const out = await call(makeLiveThompson({ env: {}, fetchImpl: bad }), { payer: "0xaaa" })
    assert.equal(out.ok, false)
    assert.equal(out.reason, "receipts_unreachable")
  }],
  ["a malformed receipts response does not pretend to be data", async () => {
    const r = await readReceipts({ fetchImpl: feed({ ok: true }), env: {} })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "receipts_malformed")
  }],
  ["an unknown address => cold_start, not a price drawn from Beta(1,1)", async () => {
    const out = await call(makeLiveThompson({ env: {}, fetchImpl: okFeed }), { payer: "0xZZZ" })
    assert.equal(out.ok, false)
    assert.equal(out.reason, "cold_start_no_purchase_history")
    assert.equal(out.basePriceUsdc, 0.001)
  }],
  ["no conversion observations => refuse to compute a Bayesian price", async () => {
    const out = await call(makeLiveThompson({ env: {}, fetchImpl: okFeed }), { payer: "0xaaa" })
    assert.equal(out.ok, false)
    assert.equal(out.reason, "no_conversion_observations")
    assert.equal(out.history.purchases, 3)
  }],
  ["successRate is rejected unless the assumption is acknowledged explicitly", async () => {
    const out = await call(makeLiveThompson({ env: {}, fetchImpl: okFeed }), { payer: "0xaaa", successRate: "0.5" })
    assert.equal(out.reason, "no_conversion_observations")
    const bad = await call(makeLiveThompson({ env: {}, fetchImpl: okFeed }), { payer: "0xaaa", successRate: "9", acceptUnobserved: "1" })
    assert.equal(bad.reason, "no_conversion_observations")
  }],
  ["an explicit assumption => it computes, but is labeled an assumption", async () => {
    const out = await call(makeLiveThompson({ env: {}, fetchImpl: okFeed }), { payer: "0xaaa", successRate: "0.5", acceptUnobserved: "1" })
    assert.equal(out.ok, true)
    assert.equal(out.history.purchases, 3)
    assert.equal(out.assumptions[0].status, "assumption_not_observation")
    assert.equal(out.priceDependsOnObservations, false)
    assert.equal(out.priceUsdc, 0.0009)
  }],
  ["identical inputs => a bit-for-bit identical answer", async () => {
    const h = makeLiveThompson({ env: {}, fetchImpl: okFeed })
    const q = { payer: "0xaaa", successRate: "0.5", acceptUnobserved: "1" }
    const a = await call(h, q), b = await call(h, q)
    assert.equal(JSON.stringify(a.posterior), JSON.stringify(b.posterior))
    assert.equal(a.determinism.seed, b.determinism.seed)
    assert.equal(a.determinism.seeded, true)
  }],
  ["a different payer => a different seed", async () => {
    const h = makeLiveThompson({ env: {}, fetchImpl: okFeed })
    const a = await call(h, { payer: "0xaaa", successRate: "0.5", acceptUnobserved: "1" })
    const b = await call(h, { payer: "0xbbb", successRate: "0.5", acceptUnobserved: "1" })
    assert.equal(a.determinism.seed === b.determinism.seed, false)
  }],
  ["the global Math.random is restored", async () => {
    const orig = Math.random
    await withSeededRandom("deadbeef", async () => { assert.equal(Math.random === orig, false) })
    assert.equal(Math.random, orig)
    try { await withSeededRandom("deadbeef", async () => { throw new Error("failure") }) } catch (_) {}
    assert.equal(Math.random, orig)
  }],
  ["the seed is reproducible", async () => {
    const a = seededRandom("cafebabe"), b = seededRandom("cafebabe")
    assert.equal(a(), b())
  }],
  ["the live thompson overrides the stub wrapper", async () => {
    assert.equal(REAL_ROUTES.thompson === PROVENANCE_ROUTES.thompson, false)
    assert.equal(typeof REAL_ROUTES.thompson, "function")
    const sf = await call(REAL_ROUTES["shadow-float"], {})
    assert.equal(sf.dataProvenance.synthetic, true)
    assert.equal(sf.ok, true)
  }],
]
for (const [name, fn] of cases) { await fn(); n += 1; console.log("  ok - " + name) }
console.log("\nLiveThompson: " + n + "/" + cases.length + " passed")
