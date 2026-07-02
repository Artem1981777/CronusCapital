import test from "node:test"
import assert from "node:assert/strict"
import { buildTraceRecord, contentHash, withCogs } from "../lib/traceArchive.js"

const base = () => buildTraceRecord(
  { model: "m", seed: 7, temperature: 0, topic: "t", instId: "BTC-USDC", price: 100, changePct: 1, high24h: 110, low24h: 90, vol24h: 5 },
  { verdict: "YES", conviction: 60, trace: ["DECIDE: x"], analog: null, decisions: [] },
)

test("withCogs is a no-op without purchases (hash unchanged)", () => {
  const r = base()
  assert.equal(withCogs(r, null), r)
  assert.equal(withCogs(r, { upstream_payments: [] }), r)
  assert.equal(contentHash(withCogs(r, { upstream_payments: [] })), contentHash(r))
})
test("withCogs attaches auditable COGS and changes the hash", () => {
  const r = base()
  const cogs = { cogs_atomic: 100, upstream_payments: [{ sourceId: "cb", priceUsdAtomic: 100, recipient: "0x" + "a".repeat(40), mode: "simulated", txRef: null }] }
  const w = withCogs(r, cogs)
  assert.ok(w.cogs)
  assert.equal(w.cogs.cogs_atomic, 100)
  assert.equal(w.cogs.upstream_payments[0].mode, "simulated")
  assert.equal(w.cogs.upstream_payments[0].txRef, null)
  assert.notEqual(contentHash(w), contentHash(r))
})
test("withCogs keeps txRef only for settled entries", () => {
  const r = base()
  const w = withCogs(r, { cogs_atomic: 900, upstream_payments: [{ sourceId: "x", priceUsdAtomic: 900, recipient: "0x" + "b".repeat(40), mode: "settled", txRef: "0xdead" }] })
  assert.equal(w.cogs.upstream_payments[0].txRef, "0xdead")
})
