import { test } from "node:test"
import assert from "node:assert/strict"
import { normProb, resolvedFromLedger, brier, calibration } from "../lib/backtest.js"

test("normProb normalizes 0..1 and 0..100 scales", () => {
  assert.equal(normProb(0.7), 0.7)
  assert.equal(normProb(70), 0.7)
  assert.equal(normProb(150), 1)
  assert.equal(normProb(-5), 0)
  assert.equal(normProb("abc"), null)
})

test("resolvedFromLedger keeps only resolved positions", () => {
  const led = [
    { status: "open", conviction: 0.8 },
    { status: "correct", conviction: 0.8, marketId: "BTC-USDC:2026-07-01", openPrice: 100, resolvePrice: 110 },
    { status: "wrong", conviction: 0.7 },
    { status: "void", conviction: 0.9 },
  ]
  const r = resolvedFromLedger(led)
  assert.equal(r.length, 2)
  assert.equal(r[0].outcome, 1)
  assert.equal(r[1].outcome, 0)
  assert.equal(r[0].p, 0.8)
})

test("brier computes score, base rate and skill", () => {
  const s = [
    { p: 0.8, outcome: 1 },
    { p: 0.6, outcome: 0 },
    { p: 0.9, outcome: 1 },
    { p: 0.7, outcome: 0 },
  ]
  const b = brier(s)
  assert.equal(b.n, 4)
  assert.equal(b.brier, 0.225)
  assert.equal(b.baseRate, 0.5)
  assert.equal(b.accuracy, 0.5)
  assert.equal(b.baseBrier, 0.25)
  assert.equal(b.skillScore, 0.1)
})

test("brier is null with no resolved samples", () => {
  const b = brier([])
  assert.equal(b.n, 0)
  assert.equal(b.brier, null)
  assert.equal(b.skillScore, null)
})

test("calibration bins group by predicted probability", () => {
  const s = [
    { p: 0.8, outcome: 1 },
    { p: 0.6, outcome: 0 },
    { p: 0.9, outcome: 1 },
    { p: 0.7, outcome: 0 },
  ]
  const c = calibration(s, 5)
  assert.equal(c.length, 5)
  assert.equal(c[3].count, 2)
  assert.equal(c[3].mean_predicted, 0.65)
  assert.equal(c[3].empirical_accuracy, 0)
  assert.equal(c[4].count, 2)
  assert.equal(c[4].mean_predicted, 0.85)
  assert.equal(c[4].empirical_accuracy, 1)
})
