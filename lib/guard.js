// lib/guard.js — global emergency kill switch for all fund-moving execute paths.
// Flip EMERGENCY_PAUSE=1 (or true) in Vercel env to instantly block every
// execute path (swap, bridge, payout, private MCP), independent of any other
// guard. Env-only: cannot be toggled through the MCP or any request param.
export function emergencyPaused() {
  const v = String(process.env.EMERGENCY_PAUSE || "").trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes" || v === "on"
}
export function pauseError() {
  return { paused: true, error: "EMERGENCY_PAUSE active: all fund-moving execution is halted by operator env flag" }
}
