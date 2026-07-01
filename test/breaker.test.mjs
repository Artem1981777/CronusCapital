import { test } from "node:test"
import assert from "node:assert/strict"
import { decideDaily } from "../lib/breaker.js"

test("allows spend within daily budget", () => {
  const d = decideDaily("0", "50000", "1000000")
  assert.equal(d.allowed, true)
  assert.equal(d.remainingAtomic, "950000")
})

test("blocks spend exceeding remaining daily budget", () => {
  const d = decideDaily("990000", "50000", "1000000")
  assert.equal(d.allowed, false)
  assert.equal(d.reason, "exceeds remaining daily budget")
})

test("allows spend exactly equal to remaining", () => {
  const d = decideDaily("950000", "50000", "1000000")
  assert.equal(d.allowed, true)
  assert.equal(d.remainingAtomic, "0")
})

test("blocks non-positive amount", () => {
  const d = decideDaily("0", "0", "1000000")
  assert.equal(d.allowed, false)
})

test("blocks when the daily budget is already exhausted", () => {
  const d = decideDaily("1000000", "1", "1000000")
  assert.equal(d.allowed, false)
  assert.equal(d.remainingAtomic, "0")
})
