// lib/breaker.js — shared daily spend breaker for treasury-signing paths.
// Reuses the same KV day-key + policy as /api/spend-limit so every USDC
// outflow (claim, cross-chain payout, spend-limit) draws down ONE unified
// daily ceiling. Pure decideDaily() is unit-tested; checkDaily()/recordDaily()
// talk to KV. When KV is configured (prod) checkDaily enforces; if the store is
// unreachable it returns unavailable:true so callers fall back to a per-call cap.
const DEFAULT_DAILY = process.env.SPEND_DAILY_CAP_ATOMIC || "1000000"
const POLICY_KEY = "cronus:spend:policy"

function dayKey() { return "cronus:spend:day:" + new Date().toISOString().slice(0, 10) }

async function kvCmd(cmd) {
  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return { ok: false, result: null }
  try {
    const r = await fetch(base, { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(cmd) })
    const j = await r.json()
    return { ok: true, result: j && j.result }
  } catch { return { ok: false, result: null } }
}

async function dailyCapAtomic() {
  const p = await kvCmd(["GET", POLICY_KEY])
  if (p.ok && p.result) {
    try { const j = typeof p.result === "string" ? JSON.parse(p.result) : p.result; if (j && j.dailyCapAtomic) return BigInt(j.dailyCapAtomic) } catch { /* ignore */ }
  }
  return BigInt(DEFAULT_DAILY)
}

export function decideDaily(spentAtomic, amountAtomic, capAtomic) {
  const spent = BigInt(spentAtomic || "0")
  const amt = BigInt(amountAtomic || "0")
  const cap = BigInt(capAtomic || "0")
  const remaining = cap > spent ? cap - spent : 0n
  if (amt <= 0n) return { allowed: false, reason: "amount must be > 0", remainingAtomic: String(remaining) }
  if (amt > remaining) return { allowed: false, reason: "exceeds remaining daily budget", remainingAtomic: String(remaining) }
  return { allowed: true, reason: "within daily budget", remainingAtomic: String(remaining - amt) }
}

export async function checkDaily(amountAtomic) {
  const cap = await dailyCapAtomic()
  const today = await kvCmd(["GET", dayKey()])
  if (!today.ok) return { allowed: false, unavailable: true, reason: "breaker store unavailable; per-call cap still applies", remainingAtomic: "0", dailyCapAtomic: String(cap) }
  const spent = BigInt(today.result || "0")
  return Object.assign({ unavailable: false, spentTodayAtomic: String(spent), dailyCapAtomic: String(cap) }, decideDaily(String(spent), amountAtomic, String(cap)))
}

export async function recordDaily(amountAtomic) {
  const k = dayKey()
  await kvCmd(["INCRBY", k, String(amountAtomic)])
  await kvCmd(["EXPIRE", k, "172800"])
}
