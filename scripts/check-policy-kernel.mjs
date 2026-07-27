// Автономная проверка PolicyKernel. Не трогает npm test и его конфиг.
import assert from "node:assert/strict"
import { evaluate, applyAdvice } from "../lib/policyKernel.js"

const TO = "0x6829860b7f61FA01E5bf3D194d9f780ACa5B6787"
const H = "a".repeat(64)
const okCtx = {
  dailyCapAtomic: 1_000_000, perTxCapAtomic: 10_000,
  perRecipientCapAtomic: 250_000, spentTodayAtomic: 0,
  spentRecipientAtomic: 0, allowlist: [TO],
  signalAgeSeconds: 60, maxAgeSeconds: 1800,
  convictionBar: 65, factGuard: { ok: true },
}
const act = { kind: "payout", amountAtomic: 5_000, recipient: TO, conviction: 70, traceHash: H }
let n = 0
const t = (name, fn) => { fn(); n++; console.log("  ok -", name) }

t("happy path allows", () => {
  const r = evaluate(act, okCtx)
  assert.equal(r.allow, true, JSON.stringify(r.reasons))
  assert.equal(r.amountAtomic, 5_000)
})
t("fail-closed: пустой контекст запрещает", () => {
  assert.equal(evaluate(act, {}).allow, false)
})
t("fail-closed: нет allowlist => запрет", () => {
  const { allowlist, ...c } = okCtx
  assert.deepEqual(evaluate(act, c).reasons.includes("allowlist_missing"), true)
})
t("per-tx cap", () => {
  assert.equal(evaluate({ ...act, amountAtomic: 10_001 }, okCtx).reasons[0], "per_tx_cap_exceeded")
})
t("daily cap", () => {
  const r = evaluate(act, { ...okCtx, spentTodayAtomic: 999_000 })
  assert.equal(r.reasons.includes("daily_cap_exceeded"), true)
})
t("recipient cap", () => {
  const r = evaluate(act, { ...okCtx, spentRecipientAtomic: 249_000 })
  assert.equal(r.reasons.includes("recipient_cap_exceeded"), true)
})
t("stale signal", () => {
  assert.equal(evaluate(act, { ...okCtx, signalAgeSeconds: 1801 }).reasons.includes("signal_stale"), true)
})
t("fact guard обязателен", () => {
  const r = evaluate(act, { ...okCtx, factGuard: { ok: false } })
  assert.equal(r.reasons.includes("fact_guard_not_passed"), true)
})
t("conviction ниже планки", () => {
  assert.equal(evaluate({ ...act, conviction: 64 }, okCtx).reasons.includes("conviction_below_bar"), true)
})
t("нет trace hash => запрет", () => {
  assert.equal(evaluate({ ...act, traceHash: "nope" }, okCtx).reasons.includes("trace_hash_missing"), true)
})
t("kill switch", () => {
  assert.equal(evaluate(act, { ...okCtx, paused: true }).allow, false)
})
t("LLM НЕ может поднять сумму", () => {
  const r = applyAdvice(evaluate(act, okCtx), { amountAtomic: 9_999_999 })
  assert.equal(r.allow, true)
  assert.equal(r.amountAtomic, 5_000)
  assert.equal(r.reasons.includes("advisory_raise_ignored"), true)
})
t("LLM может уменьшить сумму", () => {
  assert.equal(applyAdvice(evaluate(act, okCtx), { amountAtomic: 1_000 }).amountAtomic, 1_000)
})
t("LLM может запретить", () => {
  assert.equal(applyAdvice(evaluate(act, okCtx), { allow: false }).allow, false)
})
t("LLM НЕ может сменить получателя", () => {
  const r = applyAdvice(evaluate(act, okCtx), { recipient: "0x000000000000000000000000000000000000dEaD" })
  assert.equal(r.recipient, TO.toLowerCase())
  assert.equal(r.reasons.includes("advisory_recipient_ignored"), true)
})
t("детерминизм", () => {
  assert.equal(JSON.stringify(evaluate(act, okCtx)), JSON.stringify(evaluate(act, okCtx)))
})
console.log("\nPolicyKernel: " + n + "/" + n + " passed")
