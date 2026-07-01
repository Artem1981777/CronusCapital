import { test } from "node:test"
import assert from "node:assert/strict"
import { decideTick } from "../src/lib/sessionGuard.ts"

const base = { stopped: false, now: 1000, deadline: 10000, perTickUsd: 0.01, perTxCapUsd: 0.02, spentUsd: 0, budgetUsd: 0.05 }

test("proceeds within all limits", () => {
  const d = decideTick(base)
  assert.equal(d.proceed, true)
  assert.match(d.reason, /within/)
})
test("user stop wins first", () => {
  const d = decideTick({ ...base, stopped: true, now: 99999, spentUsd: 999 })
  assert.equal(d.proceed, false)
  assert.equal(d.reason, "stopped by user")
})
test("TTL expiry blocks", () => {
  const d = decideTick({ ...base, now: 10001 })
  assert.equal(d.proceed, false)
  assert.equal(d.reason, "session TTL expired")
})
test("per-tx cap blocks when tick exceeds cap", () => {
  const d = decideTick({ ...base, perTickUsd: 0.03, perTxCapUsd: 0.02 })
  assert.equal(d.proceed, false)
  assert.equal(d.reason, "per-tx cap exceeded")
})
test("budget exhaustion blocks", () => {
  const d = decideTick({ ...base, spentUsd: 0.05, perTickUsd: 0.01, budgetUsd: 0.05 })
  assert.equal(d.proceed, false)
  assert.equal(d.reason, "budget exhausted")
})
test("exact-fit tick allowed via epsilon tolerance", () => {
  const d = decideTick({ ...base, spentUsd: 0.04, perTickUsd: 0.01, budgetUsd: 0.05 })
  assert.equal(d.proceed, true)
})
test("check order: TTL takes precedence over budget", () => {
  const d = decideTick({ ...base, now: 99999, spentUsd: 999 })
  assert.equal(d.reason, "session TTL expired")
})
