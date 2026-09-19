// Node test mirror of sessionGuard.ts. Keep the pure safety gate behavior identical.
export function decideTick({ stopped, now, deadline, perTickUsd, perTxCapUsd, spentUsd, budgetUsd }) {
  if (stopped) return { proceed: false, reason: "stopped by user" }
  if (now >= deadline) return { proceed: false, reason: "session TTL expired" }
  if (perTickUsd > perTxCapUsd) return { proceed: false, reason: "per-tx cap exceeded" }
  if (spentUsd >= budgetUsd || spentUsd + perTickUsd > budgetUsd + 1e-9) return { proceed: false, reason: "budget exhausted" }
  return { proceed: true, reason: "within session limits" }
}
