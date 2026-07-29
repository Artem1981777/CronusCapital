import test from "node:test"
import assert from "node:assert/strict"
import { isSanePrice, cleanRounds, annualize, projectIdleYield, SELECTORS, ARC, USYC_VERSION } from "../lib/treasury/usyc.js"

// The real corrupt round observed on Arc testnet.
const CORRUPT = { round: 98, price: 275.68721029, ts: 1783133400 }
const GOOD = [
  { round: 1, price: 1.1107684, ts: 1766144820 },
  { round: 40, price: 1.11520069, ts: 1770039180 },
  { round: 60, price: 1.12915268, ts: 1782390600 },
  { round: 102, price: 1.13237391, ts: 1785242639 },
]

test("a tokenized T-bill share near 1 USDC is sane", () => {
  assert.equal(isSanePrice(1.1323), true)
  assert.equal(isSanePrice(0.99), true)
})

test("the corrupt 275 USDC round is not treated as a price", () => {
  assert.equal(isSanePrice(CORRUPT.price), false)
  assert.equal(isSanePrice(0), false)
  assert.equal(isSanePrice(NaN), false)
  assert.equal(isSanePrice("1.13"), false)
})

test("corrupt rounds are rejected AND reported, never silently dropped", () => {
  const { kept, dropped } = cleanRounds([...GOOD, CORRUPT])
  assert.equal(kept.length, 4)
  assert.equal(dropped.length, 1)
  assert.equal(dropped[0].round, 98)
  assert.match(dropped[0].why, /sane band/)
})

test("rounds repeating a timestamp are dropped (oracle ids are not contiguous)", () => {
  const dup = { round: 90, price: 1.13156022, ts: GOOD[3].ts }
  const { kept, dropped } = cleanRounds([...GOOD, dup])
  assert.equal(kept.length, 4)
  assert.match(dropped[0].why, /duplicate timestamp/)
})

test("kept rounds come back in chronological order", () => {
  const { kept } = cleanRounds([GOOD[3], GOOD[0], GOOD[2], GOOD[1]])
  assert.deepEqual(kept.map((r) => r.round), [1, 40, 60, 102])
})

test("annualized yield matches the real fund (~3.2 percent)", () => {
  const y = annualize(GOOD[0], GOOD[3])
  assert.ok(y.apyPct > 2.5 && y.apyPct < 4, "apy was " + y.apyPct)
  assert.ok(y.spanDays > 200 && y.spanDays < 230, "span was " + y.spanDays)
  assert.equal(y.from.round, 1)
  assert.equal(y.to.round, 102)
})

test("a single point cannot produce a yield", () => {
  assert.equal(annualize(GOOD[0], GOOD[0]), null)
  assert.equal(annualize(null, GOOD[0]), null)
})

test("a corrupt round would have produced an absurd yield if not filtered", () => {
  const naive = annualize(GOOD[0], CORRUPT)
  assert.ok(naive.apyPct > 1000, "this is exactly what filtering prevents")
  const { kept } = cleanRounds([GOOD[0], CORRUPT, GOOD[3]])
  const filtered = annualize(kept[0], kept[kept.length - 1])
  assert.ok(filtered.apyPct < 5)
})

test("idle yield is a counterfactual and says so", () => {
  const p = projectIdleYield(100, 3.232, 30)
  assert.equal(p.booked, false)
  assert.match(p.note, /never added to vault NAV/)
  assert.ok(p.wouldEarnUsdc > 0 && p.wouldEarnUsdc < 1)
})

test("no projection without money or without a measured rate", () => {
  assert.equal(projectIdleYield(0, 3.2, 30), null)
  assert.equal(projectIdleYield(100, null, 30), null)
  assert.equal(projectIdleYield(100, 3.2, 0), null)
})

test("entitlement is checked with canCall, whose selector is ERC-4626 deposit", () => {
  assert.equal(SELECTORS.deposit, "0x6e553f65")
  assert.equal(SELECTORS.redeem, "0xba087652")
})

test("addresses are the ones Circle documents for Arc testnet", () => {
  assert.equal(ARC.usyc.toLowerCase(), "0xe9185f0c5f296ed1797aae4238d26ccabeadb86c")
  assert.equal(ARC.chainId, 5042002)
  assert.equal(USYC_VERSION, "usyc-1")
})
