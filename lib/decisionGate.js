// lib/decisionGate.js — Cronus DecisionGate (gate-1).
// Closes PolicyKernel and FactGuard into one mandatory link of the pipeline.
// ADDITIVE: lib/upgrades/* are unchanged; the gate wraps their result.
// The point: no spending action passes unless the market confirms the numbers.
import { evaluate, applyAdvice } from "./policyKernel.js"
import { guard } from "./factGuard.js"

export const GATE_VERSION = "gate-1"

// Consequence classes. The distinction Cronus insists on: a wrong forecast and a lie are not the same thing.
export const OUTCOME = {
  CLEAN: "clean",             // passed, the action is allowed
  BLOCKED: "blocked",         // failed on limits/freshness/conviction - NOT slashable
  UNVERIFIABLE: "unverifiable", // sources unconfirmed - NOT slashable, but spending is forbidden
  FABRICATION: "fabrication", // the numbers were invented - grounds for slashing
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

// The section added to a Strategy Passport. It mutates nothing and changes no existing field.
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

// A wrapper around createStrategyPassport: it adds the gate section and an honest data label.
export function withGate(passport, gate, meta = {}) {
  return Object.assign({}, passport, {
    gate: gateSection(gate),
    dataProvenance: {
      // HONESTLY: if the decision is synthetic, that is visible in the response, not only in a code comment
      synthetic: meta.synthetic === true,
      source: meta.source || (meta.synthetic === true ? "mock" : "live"),
    },
  })
}

export default { runGate, gateSection, withGate, GATE_VERSION, OUTCOME }
