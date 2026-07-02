// lib/dataMarket.js — "Cronus pays to think": autonomous upstream data-purchase decision + COGS.
// Cronus is not only PAID for signals; when its conviction is borderline it can PAY upstream
// x402/nanopayment data providers for corroborating data, making it a FULL economic actor
// (seller AND buyer) on Arc. This module is PURE and DRY-RUN by default: it decides IF a purchase
// is warranted and records the INTENDED nanopayment (source, price, recipient) into the decision
// trace as cost-of-goods (COGS). It NEVER moves funds. Real settlement is gated behind
// PAY_TO_THINK_LIVE plus an explicit operator go-ahead and reuses the existing creator-layer split.
// Honesty: simulated purchases are labeled mode:"simulated" and are NEVER counted as settled spend.

// flag: master enable for the pay-to-think decision path (default OFF -> zero behavior change).
export function dataMarketEnabled(env) {
  return String((env || {}).PAY_TO_THINK || "") === "1"
}

// flag: allow REAL on-chain settlement of upstream purchases (default OFF -> simulated only).
export function liveSettlementEnabled(env) {
  return String((env || {}).PAY_TO_THINK_LIVE || "") === "1"
}

// pure: parse the upstream data-source registry (JSON string or array). Each source:
// { id, label, url, priceUsdAtomic (6dp USDC atomic), recipient (0x..) }. Invalid entries dropped.
export function parseSources(raw) {
  let arr = raw
  if (typeof raw === "string") { try { arr = JSON.parse(raw) } catch (_) { return [] } }
  if (!Array.isArray(arr)) return []
  const ADDR = /^0x[0-9a-fA-F]{40}$/
  const out = []
  for (const s of arr) {
    if (!s || typeof s !== "object") continue
    const id = String(s.id || "").trim()
    const price = Number(s.priceUsdAtomic)
    const recipient = String(s.recipient || "").trim()
    if (!id || !isFinite(price) || price <= 0 || !ADDR.test(recipient)) continue
    out.push({ id, label: String(s.label || id), url: String(s.url || ""), priceUsdAtomic: Math.floor(price), recipient })
  }
  return out
}

// pure: decide whether to buy upstream data to improve a BORDERLINE verdict.
// Rationale: spend only when draft conviction is uncertain (high information value) AND the
// cheapest source fits the remaining budget. Confident or throwaway-low verdicts skip (no waste).
export function decideDataPurchase(args) {
  const a = args || {}
  const enabled = !!a.enabled
  const conviction = Number(a.conviction)
  const sources = Array.isArray(a.sources) ? a.sources : []
  const lowConf = Number(a.lowConf != null ? a.lowConf : 45)
  const highConf = Number(a.highConf != null ? a.highConf : 70)
  const budgetAtomic = Number(a.budgetAtomic)
  const spentAtomic = Number(a.spentAtomic || 0)
  if (!enabled) return { buy: false, source: null, reason: "pay-to-think disabled" }
  if (!sources.length) return { buy: false, source: null, reason: "no upstream sources configured" }
  if (!isFinite(conviction)) return { buy: false, source: null, reason: "no conviction to assess" }
  if (conviction < lowConf) return { buy: false, source: null, reason: "conviction below floor; not worth buying" }
  if (conviction >= highConf) return { buy: false, source: null, reason: "conviction already sufficient; no purchase" }
  const remaining = (isFinite(budgetAtomic) ? budgetAtomic : Infinity) - (isFinite(spentAtomic) ? spentAtomic : 0)
  const affordable = sources.filter((s) => Number(s.priceUsdAtomic) <= remaining).sort((x, y) => x.priceUsdAtomic - y.priceUsdAtomic)
  if (!affordable.length) return { buy: false, source: null, reason: "budget exhausted for upstream data" }
  return { buy: true, source: affordable[0], reason: "borderline conviction " + conviction + " in [" + lowConf + "," + highConf + "); buying corroboration" }
}

// pure: build a trace-embeddable COGS entry. mode "settled" REQUIRES live + a real txRef; otherwise
// "simulated" (txRef:null) and NEVER counted as real spend. Makes cost-of-thinking auditable.
export function recordUpstreamPayment(source, opts) {
  const o = opts || {}
  const s = source || {}
  const mode = o.live && o.txRef ? "settled" : "simulated"
  return {
    sourceId: s.id || null,
    label: s.label || s.id || null,
    priceUsdAtomic: Math.floor(Number(s.priceUsdAtomic) || 0),
    recipient: s.recipient || null,
    mode,
    txRef: mode === "settled" ? o.txRef : null,
  }
}

// pure: total cost-of-goods (atomic USDC) across purchases; settledOnly filters to real spend.
export function cogsAtomic(payments, opts) {
  const only = (opts || {}).settledOnly
  return (Array.isArray(payments) ? payments : []).reduce((sum, p) => {
    if (!p) return sum
    if (only && p.mode !== "settled") return sum
    const v = Number(p.priceUsdAtomic)
    return sum + (isFinite(v) && v > 0 ? Math.floor(v) : 0)
  }, 0)
}

// pure: net P&L (atomic) after subtracting data COGS from revenue.
export function netPnlAfterCogs(revenueAtomic, payments, opts) {
  const rev = Number(revenueAtomic)
  return (isFinite(rev) ? Math.floor(rev) : 0) - cogsAtomic(payments, opts)
}
