// lib/priceSources.js — honest 2nd price source (data-integrity cross-check for /api/consult).
// OKX stays the PRIMARY market feed; this adds an INDEPENDENT corroborating spot price from
// Coinbase so a single-venue glitch or manipulation becomes visible. Pure helpers are unit-tested;
// the network fetch is isolated and fail-open. Additive — it annotates the response with source
// agreement and NEVER changes the verdict. Honest: on any failure, agree stays null (never faked).

// pure: OKX instId (e.g. "BTC-USDC", "ETH-USDT") -> base asset ("BTC").
export function parseBase(instId) {
  const s = String(instId || "").toUpperCase().trim()
  if (!s) return null
  const head = s.split("-")[0]
  return head || null
}

// pure: compare primary (OKX) vs alt (2nd source). tolPct = agreement band in percent.
export function crossCheckDecision(okxPrice, altPrice, tolPct) {
  const a = Number(okxPrice), b = Number(altPrice)
  const tol = Number(tolPct)
  if (!isFinite(a) || a <= 0 || !isFinite(b) || b <= 0) {
    return { altPrice: isFinite(b) && b > 0 ? b : null, spreadPct: null, agree: null }
  }
  const spreadPct = ((b - a) / a) * 100
  const agree = Math.abs(spreadPct) <= (isFinite(tol) ? tol : 1)
  return { altPrice: b, spreadPct: Number(spreadPct.toFixed(4)), agree }
}

// isolated network (fail-open): Coinbase public spot (no key). base/instId -> USD spot number|null.
export async function fetchCoinbaseSpot(base, fetchImpl) {
  const b = parseBase(base)
  if (!b) return null
  const f = fetchImpl || fetch
  try {
    const r = await f("https://api.coinbase.com/v2/prices/" + b + "-USD/spot")
    const j = await r.json()
    const px = j && j.data && j.data.amount ? Number(j.data.amount) : NaN
    return isFinite(px) && px > 0 ? px : null
  } catch (_) {
    return null
  }
}

// convenience: full cross-check of OKX price against the 2nd source for an instId.
export async function crossCheck(instId, okxPrice, opts) {
  const o = opts || {}
  const tolPct = Number(o.tolPct != null ? o.tolPct : (process.env.CONSULT_XCHECK_TOL_PCT || 1))
  const alt = await fetchCoinbaseSpot(instId, o.fetchImpl)
  const d = crossCheckDecision(okxPrice, alt, tolPct)
  return { source: "coinbase", tolerancePct: tolPct, altPrice: d.altPrice, spreadPct: d.spreadPct, agree: d.agree }
}
