// lib/fx.js — pure, zero-dependency multi-currency (USDC + EURC) helpers for Cronus.
// Additive: lets the x402 paywall OPTIONALLY accept EURC alongside USDC, converting
// EURC -> USD-equivalent via an OFF-CHAIN FX reference (clearly labeled; NOT a price oracle).
// Amounts are atomic (6 decimals). Nothing here moves funds or touches chain state.

const USDC_ADDRESS = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase()
const EURC_ADDRESS = (process.env.ARC_EURC_ADDRESS || "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a").toLowerCase()

const ASSETS = {
  [USDC_ADDRESS]: { symbol: "USDC", decimals: 6, quote: "USD" },
  [EURC_ADDRESS]: { symbol: "EURC", decimals: 6, quote: "EUR" }
}

export function eurcEnabled(env) {
  const e = env || process.env
  return String(e.EURC_ENABLED || "") === "1"
}

export function assetInfo(address) {
  if (!address) return null
  return ASSETS[String(address).toLowerCase()] || null
}

export function assetSymbol(address) {
  const a = assetInfo(address)
  return a ? a.symbol : "UNKNOWN"
}

export function acceptedAssets(env) {
  const list = [{ address: USDC_ADDRESS, symbol: "USDC", decimals: 6, quote: "USD" }]
  if (eurcEnabled(env)) list.push({ address: EURC_ADDRESS, symbol: "EURC", decimals: 6, quote: "EUR" })
  return list
}

// EUR->USD reference rate must be a positive finite number in a sane band.
export function normalizeRate(rate) {
  const r = Number(rate)
  if (!Number.isFinite(r) || r <= 0) return null
  if (r < 0.5 || r > 2) return null
  return r
}

// Convert an atomic amount of a given asset symbol into USD-equivalent atomic (6dp).
// USDC: 1:1. EURC: multiply by EUR->USD reference rate. Returns BigInt or null.
export function toUsdAtomic(amountAtomic, fromSymbol, eurUsdRate) {
  let amt
  try { amt = BigInt(amountAtomic) } catch (_) { return null }
  if (amt < 0n) return null
  const sym = String(fromSymbol || "").toUpperCase()
  if (sym === "USDC") return amt
  if (sym === "EURC") {
    const r = normalizeRate(eurUsdRate)
    if (r === null) return null
    const microRate = BigInt(Math.round(r * 1e6))
    return (amt * microRate) / 1000000n
  }
  return null
}

// Does a payment (in its own asset) cover a USD-priced amount after FX?
export function coversUsdPrice(opts) {
  const usd = toUsdAtomic(opts.paidAtomic, opts.paidSymbol, opts.eurUsdRate)
  if (usd === null) return { ok: false, reason: "unsupported asset or invalid FX rate" }
  const need = BigInt(opts.priceUsdAtomic)
  return { ok: usd >= need, usdEquivAtomic: String(usd), needAtomic: String(need) }
}

export { USDC_ADDRESS, EURC_ADDRESS }
