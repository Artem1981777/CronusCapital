// lib/policyKernel.js — Cronus PolicyKernel (pk-1).
// Детерминированный fail-closed гейт для любого расходного действия.
// ADDITIVE: дополняет lib/breaker.js и lib/spendLimit.js, ничего не заменяет.
// Инвариант: вывод LLM (advice) может только СУЗИТЬ разрешение, никогда не расширить.

export const POLICY_VERSION = "pk-1"

const isNat = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0
const isAddr = (v) => typeof v === "string" && /^0x[0-9a-f]{40}$/i.test(v)
const isHash = (v) => typeof v === "string" && /^[0-9a-f]{64}$/i.test(v)

export const SPEND_KINDS = new Set([
  "payout", "split-pay", "buy-data", "stake", "stream", "withdraw",
])

export function evaluate(action = {}, ctx = {}) {
  const r = []
  const kind = typeof action.kind === "string" ? action.kind.trim().toLowerCase() : ""
  if (!kind) r.push("action_kind_missing")

  const amount = action.amountAtomic
  if (!isNat(amount)) r.push("amount_invalid")

  const to = isAddr(action.recipient) ? action.recipient.toLowerCase() : null
  if (!to) r.push("recipient_invalid")

  const cap = ctx.dailyCapAtomic
  const txCap = ctx.perTxCapAtomic
  const rcpCap = ctx.perRecipientCapAtomic
  const spent = ctx.spentTodayAtomic
  const spentR = ctx.spentRecipientAtomic

  // fail-closed: любой отсутствующий/битый лимит => запрет, а не «пропустить»
  for (const [k, v] of [
    ["dailyCapAtomic", cap], ["perTxCapAtomic", txCap],
    ["perRecipientCapAtomic", rcpCap], ["spentTodayAtomic", spent],
    ["spentRecipientAtomic", spentR],
  ]) if (!isNat(v)) r.push("ctx_" + k + "_invalid")

  if (ctx.paused === true) r.push("kill_switch_active")

  if (r.length === 0) {
    if (amount <= 0) r.push("amount_zero")
    if (amount > txCap) r.push("per_tx_cap_exceeded")
    if (spent + amount > cap) r.push("daily_cap_exceeded")
    if (spentR + amount > rcpCap) r.push("recipient_cap_exceeded")

    if (Array.isArray(ctx.allowlist)) {
      const ok = ctx.allowlist.map((a) => String(a).toLowerCase()).includes(to)
      if (!ok) r.push("recipient_not_allowlisted")
    } else if (ctx.allowlistDisabled !== true) {
      r.push("allowlist_missing")
    }

    if (SPEND_KINDS.has(kind)) {
      if (!isNat(ctx.signalAgeSeconds) || !isNat(ctx.maxAgeSeconds)) r.push("freshness_unknown")
      else if (ctx.signalAgeSeconds > ctx.maxAgeSeconds) r.push("signal_stale")
      if (!isHash(action.traceHash)) r.push("trace_hash_missing")
      if (!ctx.factGuard || ctx.factGuard.ok !== true) r.push("fact_guard_not_passed")
      if (typeof ctx.convictionBar === "number") {
        if (typeof action.conviction !== "number" || action.conviction < ctx.convictionBar) {
          r.push("conviction_below_bar")
        }
      }
    }
  }

  const allow = r.length === 0
  return Object.freeze({
    allow, reasons: Object.freeze(r), kind, recipient: to,
    amountAtomic: allow ? amount : 0, policyVersion: POLICY_VERSION,
  })
}

// advice — необязательная рекомендация LLM. Может только запретить или уменьшить.
export function applyAdvice(base, advice = {}) {
  if (!base || base.allow !== true) return base
  const extra = []
  let amount = base.amountAtomic
  if (advice.allow === false) extra.push("advisory_deny")
  if (isNat(advice.amountAtomic)) {
    if (advice.amountAtomic < amount) amount = advice.amountAtomic
    else if (advice.amountAtomic > amount) extra.push("advisory_raise_ignored")
  }
  if (advice.recipient && String(advice.recipient).toLowerCase() !== base.recipient) {
    extra.push("advisory_recipient_ignored")
  }
  const denied = extra.includes("advisory_deny") || amount <= 0
  return Object.freeze({
    ...base, allow: !denied, amountAtomic: denied ? 0 : amount,
    reasons: Object.freeze([...base.reasons, ...extra]),
  })
}

export default { evaluate, applyAdvice, POLICY_VERSION, SPEND_KINDS }
