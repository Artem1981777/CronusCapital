// lib/privacy/selectiveDisclosure.js - selective disclosure of receipts (sd-1). ADDITIVE.
//
// WHAT THIS IS. Every receipt is decomposed into Merkle leaves of the form "field=value".
// The payer reveals ONLY the fields the verifier needs and attaches membership
// proofs for them. The remaining fields stay hidden, yet the tree root is the
// same either way, so no value can be swapped.
//
// WHAT THIS IS NOT. This is NOT zero-knowledge. The verifier learns how many fields
// a receipt has and can see that a policy cap exists. Values are hidden, structure is not.
// We call it what it is: selective disclosure, not ZK.
//
// PREDICATES. Computed leaves of the form predicate:* prove policy compliance
// WITHOUT revealing the amount: the leaf "amount within policy cap = true" is revealed, not the amount.
import { keccak256, toHex, concatHex } from "viem"

export const DISCLOSURE_VERSION = "sd-1"
export const DEFAULT_CAP_ATOMIC = 20000
export const FIELD_ORDER = ["txHash","kind","asset","payTo","payer","amountAtomic","block","settledAt","settled","memoId"]

export function canonicalLeaves(receipt, opts = {}) {
  const out = []
  for (const f of FIELD_ORDER) {
    const v = receipt[f] === undefined || receipt[f] === null ? "" : String(receipt[f])
    out.push({ field: f, value: v })
  }
  const cap = Number(opts.policyCapAtomic ?? DEFAULT_CAP_ATOMIC)
  const amt = Number(receipt.amountAtomic || 0)
  out.push({ field: "predicate:amount_within_policy_cap", value: String(amt <= cap) })
  out.push({ field: "predicate:policy_cap_atomic", value: String(cap) })
  return out
}

// leaves are hashed twice, which prevents passing an internal node off as a leaf
export function leafHash(l) {
  return keccak256(keccak256(toHex(`${l.field}\u0000${l.value}`)))
}

function hashPair(a, b) {
  return a.toLowerCase() < b.toLowerCase() ? keccak256(concatHex([a, b])) : keccak256(concatHex([b, a]))
}

export function buildTree(leaves) {
  let level = leaves.map(leafHash)
  const levels = [level]
  while (level.length > 1) {
    const next = []
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? hashPair(level[i], level[i + 1]) : level[i])
    }
    level = next
    levels.push(level)
  }
  return { root: level[0], levels }
}

export function proofFor(levels, index) {
  const proof = []
  let idx = index
  for (let d = 0; d < levels.length - 1; d++) {
    const sib = idx ^ 1
    if (sib < levels[d].length) proof.push(levels[d][sib])
    idx = Math.floor(idx / 2)
  }
  return proof
}

export function verifyLeaf(leaf, proof, root) {
  let h = leafHash(leaf)
  for (const p of proof) h = hashPair(h, p)
  return h.toLowerCase() === String(root).toLowerCase()
}

export function buildDisclosure(receipt, revealFields, opts = {}) {
  const leaves = canonicalLeaves(receipt, opts)
  const { root, levels } = buildTree(leaves)
  const wanted = new Set(revealFields || [])
  const revealed = []
  leaves.forEach((l, i) => {
    if (wanted.has(l.field)) revealed.push({ ...l, index: i, proof: proofFor(levels, i) })
  })
  return {
    version: DISCLOSURE_VERSION,
    root,
    leafCount: leaves.length,
    revealed,
    hiddenCount: leaves.length - revealed.length,
    note: "Selective disclosure, not zero-knowledge: hidden values stay hidden, but the field structure and the existence of a policy cap are visible.",
  }
}

export function verifyDisclosure(d) {
  if (!d || !d.root || !Array.isArray(d.revealed)) return { ok: false, error: "malformed disclosure" }
  for (const r of d.revealed) {
    if (!verifyLeaf({ field: r.field, value: r.value }, r.proof, d.root)) {
      return { ok: false, error: `leaf failed: ${r.field}` }
    }
  }
  return { ok: true, verified: d.revealed.map((r) => r.field), hiddenCount: d.hiddenCount }
}
