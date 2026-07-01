// price-crosscheck.mjs - independent 2nd-source price cross-check for x402
// market signals. MIT. Zero dependencies (uses global fetch).
//
// A single price venue can glitch or be manipulated. This corroborates a
// primary price against an independent public spot (Coinbase) and reports the
// spread and whether they agree within a tolerance band. Advisory: it
// annotates, it never fabricates a price - on any failure `agree` stays null.
import { fileURLToPath } from "node:url"

// pure: instId (e.g. "BTC-USDC", "ETH-USDT") -> base asset ("BTC").
export function parseBase(instId) {
  const s = String(instId || "").toUpperCase().trim()
  if (!s) return null
  const head = s.split("-")[0]
  return head || null
}

// pure: compare primary vs alt price. tolPct = agreement band in percent.
export function crossCheckDecision(primaryPrice, altPrice, tolPct) {
  const a = Number(primaryPrice), b = Number(altPrice)
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

// convenience: full cross-check of a primary price against the 2nd source.
export async function crossCheck(instId, primaryPrice, opts) {
  const o = opts || {}
  const tolPct = Number(o.tolPct != null ? o.tolPct : 1)
  const alt = await fetchCoinbaseSpot(instId, o.fetchImpl)
  const d = crossCheckDecision(primaryPrice, alt, tolPct)
  return { source: "coinbase", tolerancePct: tolPct, altPrice: d.altPrice, spreadPct: d.spreadPct, agree: d.agree }
}

// CLI: node price-crosscheck.mjs <instId> <primaryPrice> [tolPct]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [instId, primaryPrice, tolPct] = process.argv.slice(2)
  if (!instId || !primaryPrice) {
    console.error("usage: node price-crosscheck.mjs <instId> <primaryPrice> [tolPct]")
    process.exit(1)
  }
  crossCheck(instId, primaryPrice, { tolPct: tolPct != null ? Number(tolPct) : 1 })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error(e); process.exit(1) })
}
