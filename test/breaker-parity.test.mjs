// Conformance: the published primitive must agree with the production breaker
// on the shared numeric core. lib/breaker.js stays authoritative in prod (it owns
// the KV day-key and the wire-visible reason strings); this test proves that what
// we published as arc-honest-money is the same decision logic, not a demo copy.
import { test } from "node:test"
import assert from "node:assert/strict"
import { decideDaily } from "../lib/breaker.js"
import { decideSpend } from "arc-honest-money/spend-breaker"

const cases = [
  ["0", "1", "1000000"],
  ["0", "1000000", "1000000"],
  ["0", "1000001", "1000000"],
  ["900000", "100000", "1000000"],
  ["900000", "100001", "1000000"],
  ["1000000", "1", "1000000"],
  ["1500000", "1", "1000000"],
  ["0", "0", "1000000"],
  ["0", "1", "0"],
  ["123456789012345678901234567890", "1", "123456789012345678901234567891"],
]

for (const [spentAtomic, amountAtomic, capAtomic] of cases) {
  test(`parity ${spentAtomic}/${amountAtomic}/${capAtomic}`, () => {
    const prod = decideDaily(spentAtomic, amountAtomic, capAtomic)
    const pkg = decideSpend({ spentAtomic, amountAtomic, capAtomic })
    assert.equal(pkg.allowed, prod.allowed, "allowed must match")
    assert.equal(pkg.remainingAtomic, prod.remainingAtomic, "remainingAtomic must match")
  })
}
