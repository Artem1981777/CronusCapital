// lib/factGuard.js — Cronus FactGuard (fg-2).
// Separates FABRICATION (a number the market never showed) from a FORECAST ERROR (a prediction that did not come true).
// ADDITIVE: reuses lib/priceSources.js without changing a single line of it.
// The difference: priceSources is fail-OPEN (agree=null does not affect the verdict, which is right for annotation).
// FactGuard is fail-CLOSED: without a second source confirming => ok:false and spending is forbidden.
// fg-2: classification by TOKENS rather than substring ("spotPrice" no longer matches on "tp").
import { crossCheck } from "./priceSources.js"

export const FACTGUARD_VERSION = "fg-2"
export const DEFAULT_TOL_BPS = 25
export const DEFAULT_MAX_FORWARD_PCT = 25

const FWD_TOKENS = new Set(["target", "tp", "sl", "stop", "invalidation", "forecast", "projected"])
const FWD_JOINED = ["stoploss", "takeprofit", "targetprice", "stopprice"]
const OBS_TOKENS = new Set(["price", "spot", "entry", "reference", "ref", "last", "mark", "close", "mid"])
const OBS_JOINED = ["spotprice", "entryprice", "lastprice", "markprice", "refprice", "currentprice"]

export const SEVERITY = {
  fabricated_observation: "fabrication",
  implausible_forecast: "fabrication",
  sources_disagree: "unverifiable",
  corroboration_unavailable: "unverifiable",
  reference_price_unavailable: "unverifiable",
}

// pure: "spotPrice" -> ["spot","price"]; "stop_loss" -> ["stop","loss"]
export function tokens(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

export function classify(key) {
  const t = tokens(key)
  if (t.length === 0) return null
  const joined = t.join("")
  if (FWD_JOINED.includes(joined) || t.some((x) => FWD_TOKENS.has(x))) return "forward"
  if (OBS_JOINED.includes(joined) || t.some((x) => OBS_TOKENS.has(x))) return "observational"
  return null
}

// pure: extracts numeric price claims from arbitrarily nested LLM output
export function extractClaims(node, path = "$", out = []) {
  if (node == null) return out
  if (Array.isArray(node)) {
    node.forEach((v, i) => extractClaims(v, path + "[" + i + "]", out))
    return out
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      const p = path + "." + k
      const isNumLike = typeof v === "number"
        || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
      if (isNumLike) {
        const kind = classify(k)
        const value = Number(v)
        if (kind && Number.isFinite(value) && value > 0) out.push({ path: p, key: k, kind, value })
      } else if (typeof v === "object") {
        extractClaims(v, p, out)
      }
    }
  }
  return out
}

// pure: a deterministic verdict. No network, no LLM.
export function decide(input = {}) {
  const claims = Array.isArray(input.claims) ? input.claims : []
  const ref = Number(input.refPrice)
  const hasRef = Number.isFinite(ref) && ref > 0
  const tolBps = Number.isFinite(Number(input.tolBps)) ? Number(input.tolBps) : DEFAULT_TOL_BPS
  const maxFwd = Number.isFinite(Number(input.maxForwardPct))
    ? Number(input.maxForwardPct) : DEFAULT_MAX_FORWARD_PCT
  const corr = input.corroboration || {}
  const violations = []

  if (!hasRef) violations.push({ code: "reference_price_unavailable", path: null })
  if (corr.agree !== true) {
    violations.push({
      code: corr.agree === false ? "sources_disagree" : "corroboration_unavailable",
      path: null,
      spreadPct: corr.spreadPct == null ? null : corr.spreadPct,
    })
  }

  let checked = 0
  let observed = 0
  if (hasRef) {
    for (const c of claims) {
      checked += 1
      const devBps = Math.abs((c.value - ref) / ref) * 10000
      if (c.kind === "observational") {
        observed += 1
        if (devBps > tolBps) {
          violations.push({
            code: "fabricated_observation", path: c.path, value: c.value,
            refPrice: ref, deviationBps: Math.round(devBps),
          })
        }
      } else if (c.kind === "forward" && devBps / 100 > maxFwd) {
        violations.push({
          code: "implausible_forecast", path: c.path, value: c.value,
          refPrice: ref, deviationPct: Number((devBps / 100).toFixed(2)),
        })
      }
    }
  }

  const codes = violations.map((v) => v.code)
  const severity = codes.some((c) => SEVERITY[c] === "fabrication") ? "fabrication"
    : codes.length ? "unverifiable" : "clean"

  return Object.freeze({
    ok: violations.length === 0,
    severity,
    version: FACTGUARD_VERSION,
    checked,
    observed,
    refPrice: hasRef ? ref : null,
    corroboration: {
      source: corr.source == null ? null : corr.source,
      agree: corr.agree == null ? null : corr.agree,
      spreadPct: corr.spreadPct == null ? null : corr.spreadPct,
    },
    violations: Object.freeze(violations),
  })
}

// the network is isolated here: the single async entry point, using YOUR crossCheck
export async function guard(args = {}) {
  const o = args.opts || {}
  const corr = await crossCheck(args.instId, args.okxPrice, {
    tolPct: o.tolPct, fetchImpl: o.fetchImpl,
  })
  return decide({
    claims: extractClaims(args.output),
    refPrice: args.okxPrice,
    corroboration: corr,
    tolBps: o.tolBps == null ? Number(process.env.FACTGUARD_TOL_BPS || DEFAULT_TOL_BPS) : o.tolBps,
    maxForwardPct: o.maxForwardPct == null
      ? Number(process.env.FACTGUARD_MAX_FORWARD_PCT || DEFAULT_MAX_FORWARD_PCT)
      : o.maxForwardPct,
  })
}

export default { guard, decide, extractClaims, classify, tokens, FACTGUARD_VERSION, SEVERITY }
