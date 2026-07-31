import { test } from "node:test"
import assert from "node:assert/strict"
import { adaptiveGate } from "../lib/stake.js"

test("with too few resolved outcomes the gate does not move", () => {
  const g = adaptiveGate({ resolved_positions: 2, correct: 1 })
  assert.equal(g.adaptive, false)
  assert.equal(g.gate, g.base)
  assert.equal(g.reason, "insufficient_resolved_outcomes")
})

test("a weak record raises the bar before real money is risked", () => {
  const g = adaptiveGate({ resolved_positions: 40, correct: 12 })
  assert.equal(g.adaptive, true)
  assert.ok(g.gate > g.base)
  assert.ok(g.gate <= g.cap)
})

test("a strong record earns a lower bar", () => {
  const g = adaptiveGate({ resolved_positions: 40, correct: 36 })
  assert.equal(g.adaptive, true)
  assert.ok(g.gate < g.base)
  assert.ok(g.gate >= g.floor)
})

test("the learned gate is deterministic and reproducible", () => {
  const a = adaptiveGate({ resolved_positions: 33, correct: 21 })
  const b = adaptiveGate({ resolved_positions: 33, correct: 21 })
  assert.deepEqual(a, b)
})

test("the learned gate is clamped to the safe band", () => {
  const worst = adaptiveGate({ resolved_positions: 100, correct: 0 })
  const best = adaptiveGate({ resolved_positions: 100, correct: 100 })
  assert.equal(worst.gate, worst.cap)
  assert.equal(best.gate, best.floor)
})
