// lib/decisionGate.js — Cronus DecisionGate (gate-1).
// Замыкает PolicyKernel + FactGuard в одно обязательное звено пайплайна.
// ADDITIVE: lib/upgrades/* не изменяются; гейт оборачивает их результат.
// Смысл: ни одно расходное действие не проходит, если числа не подтверждены рынком.
import { evaluate, applyAdvice } from "./policyKernel.js"
import { guard } from "./factGuard.js"

export const GATE_VERSION = "gate-1"

// Классы последствий. Ключевое отличие Cronus: ошибка прогноза и ложь — разные вещи.
export const OUTCOME = {
  CLEAN: "clean",             // прошло, действие разрешено
  BLOCKED: "blocked",         // не прошло по лимитам/свежести/убеждённости — НЕ наказуемо
  UNVERIFIABLE: "unverifiable", // нет подтверждения источников — НЕ наказуемо, но расход запрещён
  FABRICATION: "fabrication", // числа выдуманы — основание для слэша
}

export async function runGate(args = {}) {
  const fg = await guard({
    instId: args.instId,
    okxPrice: args.okxPrice,
    output: args.output,
    opts: args.opts,
  })

  const ctx = Object.assign({}, args.ctx, { factGuard: { ok: fg.ok } })
  const base = evaluate(args.action || {}, ctx)
  const policy = args.advice ? applyAdvice(base, args.advice) : base

  let outcome
  if (fg.severity === "fabrication") outcome = OUTCOME.FABRICATION
  else if (fg.severity === "unverifiable") outcome = OUTCOME.UNVERIFIABLE
  else if (!policy.allow) outcome = OUTCOME.BLOCKED
  else outcome = OUTCOME.CLEAN

  return Object.freeze({
    allow: policy.allow === true && fg.ok === true,
    outcome,
    slashable: outcome === OUTCOME.FABRICATION,
    version: GATE_VERSION,
    amountAtomic: policy.allow ? policy.amountAtomic : 0,
    policy,
    factGuard: fg,
    reasons: Object.freeze([
      ...policy.reasons,
      ...fg.violations.map((v) => "fact:" + v.code),
    ]),
  })
}

// Секция для Strategy Passport. Не мутирует паспорт и не меняет его существующие поля.
export function gateSection(gate) {
  if (!gate) return { present: false }
  return {
    present: true,
    version: gate.version,
    allow: gate.allow,
    outcome: gate.outcome,
    slashable: gate.slashable,
    policyVersion: gate.policy.policyVersion,
    factGuardVersion: gate.factGuard.version,
    observationsChecked: gate.factGuard.observed,
    corroboration: gate.factGuard.corroboration,
    reasons: gate.reasons,
  }
}

// Обёртка над твоим createStrategyPassport: добавляет секцию gate и честную метку данных.
export function withGate(passport, gate, meta = {}) {
  return Object.assign({}, passport, {
    gate: gateSection(gate),
    dataProvenance: {
      // ЧЕСТНО: если решение синтетическое — это видно в ответе, а не только в комментарии кода
      synthetic: meta.synthetic === true,
      source: meta.source || (meta.synthetic === true ? "mock" : "live"),
    },
  })
}

export default { runGate, gateSection, withGate, GATE_VERSION, OUTCOME }
