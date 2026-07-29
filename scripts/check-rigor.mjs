// The gate must FORBID any claim of edge until it is proven out of sample.
import assert from "node:assert/strict"
import {
  strategyReturns, sharpe, deflatedSharpe, walkForward, edgeVerdict,
  makeRigorGate, MIN_BARS, MIN_OOS_TRADES, MIN_OOS_TSTAT, DEFAULT_GRID, sharpeRaw,
} from "../lib/rigor/rigorGate.js"

// A deterministic generator: these tests touch no network and depend on no market.
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const makeBars = (n, seed, drift) => { const r = mulberry32(seed); let p = 100; const out = [] ; for (let i = 0; i < n; i += 1) { p = p * (1 + (r() - 0.5) * 0.02 + (drift || 0)); out.push({ ts: i * 3600000, o: p, h: p * 1.001, l: p * 0.999, c: p, v: 1 }) } return out }
const noise = makeBars(600, 7, 0)
const res = () => { const o = { code: null, body: null }; o.status = (c) => { o.code = c; return o }; o.json = (b) => { o.body = b; return o }; return o }
const call = async (fo, q) => { const r = res(); await makeRigorGate(fo)({ query: q || {} }, r); return r }

let n = 0
const cases = [
  ["on a random series the edge is unproven", async () => {
    const r = await call({ bars: noise })
    assert.equal(r.code, 200)
    assert.equal(r.body.ok, true)
    assert.equal(r.body.edgeClaim, "unproven")
    assert.equal(r.body.mayAdvertiseEdge, false)
    assert.equal(r.body.blockers.length > 0, true)
  }],
  ["noise is rejected on every seed, not just a lucky one", async () => {
    for (const seed of [7, 11, 23, 41, 97]) {
      const r = await call({ bars: makeBars(600, seed, 0) })
      assert.equal(r.body.edgeClaim, "unproven", "seed " + seed + " produced a false proven-oos")
    }
  }],
  ["Deflated Sharpe uses the per-period Sharpe, not the annualized one", () => {
    const rets = [0.01, -0.004, 0.006, 0.002, -0.001, 0.008]
    assert.equal(Math.abs(sharpeRaw(rets) * Math.sqrt(24 * 365) - sharpe(rets)) < 1e-9, true)
    // the annualized Sharpe is ~93x larger and, fed into the correction, breaks the gate
    assert.equal(deflatedSharpe(sharpe(rets), 6, 100) > deflatedSharpe(sharpeRaw(rets), 6, 100), true)
  }],
  ["Deflated Sharpe penalizes the number of trials", () => {
    const few = deflatedSharpe(2, 2, 100)
    const many = deflatedSharpe(2, 50, 100)
    assert.equal(many < few, true, "searching 50 thresholds must be penalized harder than 2")
  }],
  ["Deflated Sharpe grows with sample length at the same Sharpe", () => {
    assert.equal(deflatedSharpe(1, 6, 1000) > deflatedSharpe(1, 6, 50), true)
  }],
  ["the threshold is fitted in-sample only", () => {
    const w = walkForward(noise, DEFAULT_GRID, 0.6)
    assert.equal(w.inSampleBars + w.oosBars, noise.length)
    assert.equal(w.oosBars > 0, true)
    const bestIs = Math.max(...w.trials.map((t) => t.inSampleSharpe))
    assert.equal(w.best.inSampleSharpe, bestIs, "the chosen threshold is not the best in-sample one")
  }],
  ["PBO is the share of thresholds with non-positive OOS", () => {
    const w = walkForward(noise, DEFAULT_GRID, 0.6)
    const manual = w.trials.filter((t) => t.oosSharpe <= 0).length / w.trials.length
    assert.equal(w.pbo, manual)
    assert.equal(w.pbo >= 0 && w.pbo <= 1, true)
  }],
  ["too few out-of-sample trades is a blocker, even at a high Sharpe", () => {
    const w = { best: { inSampleSharpe: 4650, inSampleSharpeRaw: 50, inSampleTrades: 300, oosSharpe: 9, oosSharpeRaw: 0.5, oosTrades: MIN_OOS_TRADES - 1 }, trials: [1, 2], pbo: 0 }
    const v = edgeVerdict(w)
    assert.equal(v.edgeClaim, "unproven")
    assert.equal(v.blockers.includes("oos_sample_too_small"), true)
  }],
  ["overfitting above one half is a blocker", () => {
    const w = { best: { inSampleSharpe: 4650, inSampleSharpeRaw: 50, inSampleTrades: 300, oosSharpe: 9, oosSharpeRaw: 0.3, oosTrades: 100 }, trials: [1, 2], pbo: 0.75 }
    assert.equal(edgeVerdict(w).blockers.includes("probability_of_overfitting_above_half"), true)
  }],
  ["an insignificant held-out sample blocks the claim", () => {
    // exactly the seed 7 case: the search bar is cleared, yet the result is indistinguishable from noise
    const w = { best: { inSampleSharpe: 1700, inSampleSharpeRaw: 0.1814, inSampleTrades: 203, oosSharpe: 1170, oosSharpeRaw: 0.1252, oosTrades: 97 }, trials: [1, 2, 3, 4, 5, 6], pbo: 0 }
    const v = edgeVerdict(w)
    assert.equal(v.deflatedSharpe > 0, true, "DSR is positive here - and that is not enough")
    assert.equal(v.oosTStat < MIN_OOS_TSTAT, true)
    assert.equal(v.edgeClaim, "unproven")
    assert.deepEqual(v.blockers, ["oos_not_statistically_significant"])
  }],
  ["edgeVerdict does not swallow a missing OOS Sharpe", () => {
    const w = { best: { inSampleSharpe: 1, inSampleSharpeRaw: 0.5, inSampleTrades: 100, oosSharpe: 1, oosTrades: 100 }, trials: [1, 2], pbo: 0 }
    assert.throws(() => edgeVerdict(w), /oosSharpeRaw/)
  }],
  ["an edge is granted only when every condition holds", () => {
    const w = { best: { inSampleSharpe: 4650, inSampleSharpeRaw: 50, inSampleTrades: 300, oosSharpe: 9, oosSharpeRaw: 0.3, oosTrades: 100 }, trials: [1, 2], pbo: 0 }
    const v = edgeVerdict(w)
    assert.equal(v.edgeClaim, "proven-oos")
    assert.equal(v.mayAdvertiseEdge, true)
    assert.deepEqual(v.blockers, [])
  }],
  ["a short history is not enough, the route refuses", async () => {
    const r = await call({ bars: makeBars(MIN_BARS - 1, 3, 0) })
    assert.equal(r.body.ok, false)
    assert.equal(r.body.reason, "insufficient_bars")
    assert.equal(r.body.edgeClaim, "unproven")
  }],
  ["the exchange is unavailable - a refusal, not invented metrics", async () => {
    const r = await call({ fetchImpl: async () => ({ ok: false, json: async () => ({}) }) })
    assert.equal(r.body.ok, false)
    assert.equal(r.body.reason, "candles_unavailable")
    assert.equal(r.body.edgeClaim, "unproven")
    assert.equal(r.body.deflatedSharpe, undefined, "a refusal must carry no metrics")
  }],
  ["the result is deterministic: one input, one output", async () => {
    const a = await call({ bars: noise })
    const b = await call({ bars: noise })
    const strip = (x) => Object.assign({}, x.body, { generatedAt: null })
    assert.deepEqual(strip(a), strip(b))
  }],
  ["the data is labeled real, not synthetic", async () => {
    const r = await call({ bars: noise })
    assert.equal(r.body.dataProvenance.synthetic, false)
    assert.equal(r.body.dataProvenance.sources.includes("okx:history-candles"), true)
    assert.equal(typeof r.body.disclosure, "string")
    assert.equal(r.body.relationToKelly.includes("kelly"), true)
  }],
  ["zero volatility does not produce an infinite Sharpe", () => {
    assert.equal(sharpe([0.01, 0.01, 0.01]), 0)
    assert.equal(sharpe([]), 0)
    assert.equal(strategyReturns([], 0.1).length, 0)
  }],
]
for (const [name, fn] of cases) { await fn(); n += 1; console.log("  ok - " + name) }
console.log("\nRigor: " + n + "/" + cases.length + " passed")
