// lib/kvSafe.js — fail-closed one-time-use claim for paid endpoints (ADDITIVE).
// The existing markUsedOnce() in api/signal.js fails OPEN: when Upstash is unconfigured or
// unreachable it reports { enforced: false } and the sale proceeds, so one on-chain payment
// can be replayed for unlimited signals. This helper claims an independent key and, when
// KV_FAIL_CLOSED=1, refuses the request instead of guessing. Nothing is simulated: every
// answer reflects a real Upstash response or a real failure, reported as such.

export function failClosedEnabled() {
  return String(process.env.KV_FAIL_CLOSED || "") === "1"
}

function creds() {
  return {
    base: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  }
}

// Atomically claims `key` for ttlSec seconds via SET NX EX.
// -> { ok, configured, healthy, reason }
//    ok === false  => the caller must refuse (already consumed, or fail-closed + store down)
export async function claimOnce(key, ttlSec) {
  const failClosed = failClosedEnabled()
  const { base, token } = creds()
  const ttl = String(Math.max(1, Math.floor(Number(ttlSec) || 86400)))

  if (!base || !token) {
    return { ok: !failClosed, configured: false, healthy: false,
      reason: failClosed ? "replay store not configured (fail-closed)" : "replay store not configured" }
  }

  const ac = new AbortController()
  const t = setTimeout(function () { ac.abort() }, 3000)
  try {
    const r = await fetch(base, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify(["SET", String(key), String(Date.now()), "NX", "EX", ttl]),
      signal: ac.signal,
    })
    if (!r.ok) {
      return { ok: !failClosed, configured: true, healthy: false,
        reason: "replay store HTTP " + r.status + (failClosed ? " (fail-closed)" : "") }
    }
    const j = await r.json()
    const fresh = !!(j && j.result === "OK")
    return { ok: fresh, configured: true, healthy: true,
      reason: fresh ? "claimed" : "already consumed (one-time-use)" }
  } catch (e) {
    return { ok: !failClosed, configured: true, healthy: false,
      reason: "replay store unreachable: " + String((e && e.message) || e) + (failClosed ? " (fail-closed)" : "") }
  } finally {
    clearTimeout(t)
  }
}
