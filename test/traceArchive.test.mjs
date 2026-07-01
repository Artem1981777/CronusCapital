import { test } from "node:test"
import assert from "node:assert/strict"
import { canonicalize, contentHash, buildTraceRecord, verifyRecord } from "../lib/traceArchive.js"

test("canonicalize sorts object keys stably", () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}')
  assert.equal(canonicalize({ a: 2, b: 1 }), '{"a":2,"b":1}')
  assert.equal(canonicalize([3, { y: 1, x: 2 }]), '[3,{"x":2,"y":1}]')
})

test("contentHash is key-order independent and prefixed", () => {
  const h1 = contentHash({ b: 1, a: 2 })
  const h2 = contentHash({ a: 2, b: 1 })
  assert.equal(h1, h2)
  assert.match(h1, /^sha256:[0-9a-f]{64}$/)
})

test("contentHash changes with content", () => {
  assert.notEqual(contentHash({ a: 1 }), contentHash({ a: 2 }))
})

test("buildTraceRecord normalizes input/output", () => {
  const rec = buildTraceRecord(
    { model: "m", seed: 7, temperature: 0, topic: "t", instId: "BTC-USDC", price: 100 },
    { verdict: "YES", conviction: 70, trace: ["a"], decisions: [{ action: "BUY" }] }
  )
  assert.equal(rec.v, 1)
  assert.equal(rec.input.seed, 7)
  assert.equal(rec.input.high24h, null)
  assert.equal(rec.output.verdict, "YES")
  assert.equal(rec.output.analog, null)
  assert.equal(rec.output.trace.length, 1)
})

test("verifyRecord recomputes and compares", () => {
  const rec = buildTraceRecord({ model: "m", seed: 1, temperature: 0 }, { verdict: "NO", conviction: 80 })
  const h = contentHash(rec)
  assert.equal(verifyRecord(rec, h).matches, true)
  assert.equal(verifyRecord(rec, "sha256:deadbeef").matches, false)
  assert.equal(verifyRecord(rec).matches, null)
})
