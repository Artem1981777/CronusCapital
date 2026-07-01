import { test } from "node:test"
import assert from "node:assert/strict"
import { creatorLayerEnabled, parseRegistry, totalBps, allocate, assertAllowListed, resolveCreatorSplit } from "../lib/creatorRegistry.js"

const A = "0x1111111111111111111111111111111111111111"
const B = "0x2222222222222222222222222222222222222222"
const C = "0x3333333333333333333333333333333333333333"

test("layer OFF by default (no env)", () => assert.equal(creatorLayerEnabled({}), false))
test("layer ON/OFF via flag variants", () => {
  for (const v of ["on", "1", "true", "YES", "On"]) assert.equal(creatorLayerEnabled({ CREATOR_LAYER: v }), true)
  for (const v of ["", "off", "0", "false", "no"]) assert.equal(creatorLayerEnabled({ CREATOR_LAYER: v }), false)
})
test("parseRegistry drops invalid, dedupes, keeps valid", () => {
  const reg = parseRegistry([
    { address: A, bps: 5000 },
    { address: "0xbad", bps: 100 },
    { address: B, bps: 0 },
    { address: A, bps: 9999 },
    { address: C, bps: 5000 },
  ])
  assert.equal(reg.length, 2)
  assert.deepEqual(reg.map((r) => r.address), [A, C])
})
test("parseRegistry accepts JSON string", () => {
  const reg = parseRegistry(JSON.stringify([{ address: A, bps: 10000 }]))
  assert.equal(reg.length, 1)
  assert.equal(reg[0].bps, 10000)
})
test("totalBps sums", () => assert.equal(totalBps([{ bps: 3000 }, { bps: 7000 }]), 10000))
test("allocate deterministic, last absorbs remainder (no dust)", () => {
  const creators = [{ id: "a", address: A, bps: 3333 }, { id: "b", address: B, bps: 3333 }, { id: "c", address: C, bps: 3334 }]
  const allocs = allocate("100", creators)
  const sum = allocs.reduce((s, x) => s + BigInt(x.amountAtomic), 0n)
  assert.equal(sum, 100n)
  assert.equal(allocs[allocs.length - 1].amountAtomic, "34")
})
test("assertAllowListed rejects unlisted address", () => {
  const reg = [{ address: A, bps: 5000 }, { address: B, bps: 5000 }]
  assert.equal(assertAllowListed([{ address: A }, { address: B }], reg).ok, true)
  const bad = assertAllowListed([{ address: A }, { address: C }], reg)
  assert.equal(bad.ok, false)
  assert.deepEqual(bad.unknown, [C.toLowerCase()])
})
test("resolveCreatorSplit disabled when layer off", () => {
  const r = resolveCreatorSplit({ env: {}, registry: [{ address: A, bps: 10000 }], totalAtomic: "1000" })
  assert.equal(r.enabled, false)
  assert.equal(r.action, "disabled")
})
test("resolveCreatorSplit holds on empty registry", () => {
  const r = resolveCreatorSplit({ env: { CREATOR_LAYER: "on" }, registry: [], totalAtomic: "1000" })
  assert.equal(r.action, "hold")
})
test("resolveCreatorSplit rejects when bps != 10000", () => {
  const r = resolveCreatorSplit({ env: { CREATOR_LAYER: "on" }, registry: [{ address: A, bps: 4000 }, { address: B, bps: 4000 }], totalAtomic: "1000" })
  assert.equal(r.action, "reject")
  assert.match(r.reason, /10000/)
})
test("resolveCreatorSplit splits deterministically when enabled + valid", () => {
  const r = resolveCreatorSplit({ env: { CREATOR_LAYER: "on" }, registry: [{ address: A, bps: 3000 }, { address: B, bps: 7000 }], totalAtomic: "1000000" })
  assert.equal(r.action, "split")
  assert.equal(r.totalBps, 10000)
  assert.equal(r.recipientCount, 2)
  const sum = r.allocations.reduce((s, x) => s + BigInt(x.amountAtomic), 0n)
  assert.equal(sum, 1000000n)
  assert.equal(r.allocations[0].amountAtomic, "300000")
})
test("resolveCreatorSplit rejects zero amount", () => {
  const r = resolveCreatorSplit({ env: { CREATOR_LAYER: "on" }, registry: [{ address: A, bps: 10000 }], totalAtomic: "0" })
  assert.equal(r.action, "reject")
})
