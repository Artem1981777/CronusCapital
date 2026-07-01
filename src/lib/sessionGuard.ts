// src/lib/sessionGuard.ts — pure, dependency-free spend/TTL gate for the
// ephemeral session-key streamer (src/lib/session.ts). Extracted so the exact
// money-safety limits that run in the browser are unit-tested
// (test/sessionGuard.test.mjs). It only DECIDES whether the next nano-tick may
// proceed; it never signs, pays, or touches keys. Every hard cap (per-tx,
// budget, session TTL, user stop) lives here in one auditable place.
export type TickInput = {
  stopped?: boolean
  now: number
  deadline: number
  perTickUsd: number
  perTxCapUsd: number
  spentUsd: number
  budgetUsd: number
}

export type TickDecision = { proceed: boolean; reason: string }

// Deterministic gate. Check order is preserved verbatim from the original loop
// so behavior is identical: user-stop, then TTL, then per-tx cap, then budget.
export function decideTick(input: TickInput): TickDecision {
  if (input.stopped) return { proceed: false, reason: "stopped by user" }
  if (input.now > input.deadline) return { proceed: false, reason: "session TTL expired" }
  if (input.perTickUsd > input.perTxCapUsd) return { proceed: false, reason: "per-tx cap exceeded" }
  if (input.spentUsd + input.perTickUsd > input.budgetUsd + 1e-9) return { proceed: false, reason: "budget exhausted" }
  return { proceed: true, reason: "within limits" }
}
