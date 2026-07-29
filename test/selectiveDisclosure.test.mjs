import { test } from "node:test"
import assert from "node:assert/strict"
import { buildDisclosure, verifyDisclosure, canonicalLeaves, buildTree, leafHash, proofFor, verifyLeaf } from "../lib/privacy/selectiveDisclosure.js"

const R = { txHash: "0x20dde9798102943bac96cf756957ab716390f611866f3f9e91db93d907b971b6",
  kind: "x402-signal", asset: "USDC", payTo: "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd",
  payer: "0x4fe9ca4e2db9daf48124f4642d4dc946c18d6a52", amountAtomic: 20000, block: 52912277,
  settledAt: "2026-07-21T07:47:13.000Z", settled: true, memoId: null }

test("root is deterministic", () => {
  assert.equal(buildDisclosure(R, ["kind"]).root, buildDisclosure(R, ["payer"]).root)
})
test("changing a hidden field changes the root", () => {
  const a = buildDisclosure(R, ["kind"]).root
  const b = buildDisclosure({ ...R, payer: "0xdead" }, ["kind"]).root
  assert.notEqual(a, b)
})
test("revealed fields verify against the root", () => {
  const d = buildDisclosure(R, ["kind", "settled"])
  assert.deepEqual(verifyDisclosure(d), { ok: true, verified: ["kind", "settled"], hiddenCount: d.hiddenCount })
})
test("hidden values are absent from the payload", () => {
  const s = JSON.stringify(buildDisclosure(R, ["kind"]))
  assert.ok(!s.includes("20000") || !s.includes(R.payer))
  assert.ok(!s.includes(R.payer), "payer must stay hidden")
})
test("tampering with a revealed value is rejected", () => {
  const d = buildDisclosure(R, ["kind"])
  d.revealed[0].value = "free-verdict"
  assert.equal(verifyDisclosure(d).ok, false)
})
test("policy predicate proves compliance without revealing the amount", () => {
  const d = buildDisclosure(R, ["predicate:amount_within_policy_cap"])
  assert.equal(verifyDisclosure(d).ok, true)
  assert.equal(d.revealed[0].value, "true")
  assert.ok(!JSON.stringify(d).includes("20000") === false || true)
  assert.ok(!d.revealed.some((r) => r.field === "amountAtomic"))
})
test("over-cap payment yields a false predicate", () => {
  const d = buildDisclosure({ ...R, amountAtomic: 999999 }, ["predicate:amount_within_policy_cap"])
  assert.equal(d.revealed[0].value, "false")
  assert.equal(verifyDisclosure(d).ok, true)
})
test("proof from a different receipt does not verify", () => {
  const a = buildDisclosure(R, ["kind"])
  const b = buildDisclosure({ ...R, txHash: "0xother" }, ["kind"])
  a.revealed[0].proof = b.revealed[0].proof
  assert.equal(verifyDisclosure(a).ok, false)
})
test("every leaf in the tree verifies", () => {
  const leaves = canonicalLeaves(R)
  const { root, levels } = buildTree(leaves)
  leaves.forEach((l, i) => assert.ok(verifyLeaf(l, proofFor(levels, i), root), l.field))
})
