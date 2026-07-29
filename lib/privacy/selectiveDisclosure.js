// lib/privacy/selectiveDisclosure.js — селективное раскрытие квитанций (sd-1). ADDITIVE.
//
// ЧТО ЭТО. Каждая квитанция раскладывается в листья Меркла "поле=значение".
// Плательщик раскрывает ТОЛЬКО те поля, которые нужны проверяющему, и прикладывает
// доказательства принадлежности. Остальные поля остаются скрытыми, но корень дерева
// один и тот же, поэтому подменить значение нельзя.
//
// ЧЕМ ЭТО НЕ ЯВЛЯЕТСЯ. Это НЕ zero-knowledge. Проверяющий узнаёт, сколько всего полей
// в квитанции, и видит сам факт наличия лимита политики. Скрыты значения, не структура.
// Мы называем вещи своими именами: selective disclosure, а не ZK.
//
// ПРЕДИКАТЫ. Вычисляемые листья вида predicate:* позволяют доказать соблюдение политики
// БЕЗ раскрытия суммы: раскрывается лист "сумма в пределах лимита = true", а не сумма.
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

// двойное хеширование листа — защита от подмены листа внутренним узлом
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
