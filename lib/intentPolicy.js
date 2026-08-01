// lib/intentPolicy.js — Intent Policy Decision Records (ipdr-2). ADDITIVE.
//
// WHAT THIS IS. A deterministic front door for natural-language money intents.
// Text is parsed WITHOUT an LLM into an allowlisted structure; money checks are
// delegated to lib/policyKernel.js; and EVERY decision — including every refusal —
// becomes a content-addressed Policy Decision Record that anyone can re-hash and
// verify, using the same canonicalization as lib/traceArchive.js.
//
// WHAT THIS IS NOT. Not an LLM parser: no model output can reach the money path.
// Not a hash chain: records are content-addressed and tamper-evident, not linked.
// Not custody: Cronus holds no keys; the visitor's own wallet signs every transaction.
// Not a DEX: the only convertible pair Cronus integrates is USDC<->USYC through the
// Teller on Arc. Every other pair is refused by name, never routed by guesswork.
//
// PRIVACY. The raw intent text is never stored — only its sha256 digest — so a
// requester can prove what they asked for without publishing it.
//
// VERIFIED ROUTES. CCTP V2 makes every ordered pair of supported networks routable,
// but only some have been executed by us with published transaction hashes. The
// record states which, so a reader is never left guessing what was actually proven.
//
// WHY THESE KINDS ARE NOT IN SPEND_KINDS. SPEND_KINDS gates signal-driven spends and
// demands freshness, traceHash, factGuard and conviction. A user-directed bridge or
// conversion has no signal and no model verdict; adding it would force fabricated
// values. These take the base checks and honestly skip the signal ones.
import { evaluate as evaluatePolicy } from "./policyKernel.js"
import { canonicalize, contentHash } from "./traceArchive.js"

export const INTENT_POLICY_VERSION = "ipdr-2"

export const NETWORKS = Object.freeze([
  "arc", "base", "ethereum", "arbitrum", "optimism", "avalanche",
])

// Executed by Cronus on-chain with published hashes. See docs/BRIDGE_SECURITY.md.
export const VERIFIED_ROUTES = Object.freeze(["base>arc", "arc>base"])

export const TOKENS = Object.freeze(["usdc", "usyc"])
export const SWAP_PAIRS = Object.freeze(["usdc>usyc", "usyc>usdc"])

// Named so a refusal can say which asset it was, instead of "unknown input".
const FOREIGN_TOKENS = /\b(eth|weth|btc|wbtc|dai|usdt|sol|matic|link|uni|aave|pepe|steth)\b/

const BRIDGE_VERBS = /\b(bridge|send|move|transfer)\b/
const SWAP_VERBS = /\b(swap|convert|exchange|buy|redeem|mint|sell)\b/
const REDEEM_VERBS = /\b(redeem|sell)\b/

const NOISE = /\b(sepolia|testnet|test|network|chain|the|on|please|my|tokens?|coins?)\b/g

function resolveNetwork(segment) {
  const raw = String(segment || "").toLowerCase()
  const cleaned = raw.replace(NOISE, " ").replace(/\s+/g, " ").trim()
  const table = [
    [/\barc\b/, "arc"],
    [/\bbase\b/, "base"],
    [/\b(arbitrum|arb)\b/, "arbitrum"],
    [/\b(optimism|op)\b/, "optimism"],
    [/\b(avalanche|avax|fuji)\b/, "avalanche"],
    [/\b(ethereum)\b/, "ethereum"],
  ]
  for (const [re, key] of table) if (re.test(cleaned)) return key
  if (/\bsepolia\b/.test(raw)) return "ethereum"
  return null
}

// pure: 6-decimal token string -> integer atomic units. null on malformed input.
export function toAtomicUsdc(decimalStr) {
  const s = String(decimalStr)
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const [i, f = ""] = s.split(".")
  if (f.length > 6) return null
  const n = Number(i + f.padEnd(6, "0"))
  return Number.isSafeInteger(n) ? n : null
}

export function isVerifiedRoute(from, to) {
  return VERIFIED_ROUTES.includes(from + ">" + to)
}

function refusal(reasons, missing = []) {
  return Object.freeze({
    ok: false,
    reasons: Object.freeze(reasons),
    missing: Object.freeze(missing),
  })
}

function readAmount(t, reasons) {
  const m = t.match(/(\d+(?:\.\d+)?)/)
  if (!m) { reasons.push("amount_missing"); return null }
  const a = m[1]
  if ((a.split(".")[1] || "").length > 6) reasons.push("amount_decimals_exceeded")
  if (Number(a) <= 0) reasons.push("amount_not_positive")
  return a
}

function parseBridge(t) {
  const reasons = []
  const missing = []
  const amount = readAmount(t, reasons)

  let fromSeg = null, toSeg = null
  const a = t.match(/\bfrom\s+(.+?)\s+(?:to|into|->)\s+(.+)$/)
  if (a) { fromSeg = a[1]; toSeg = a[2] }
  if (!fromSeg) {
    const b = t.match(/\bto\s+(.+?)\s+from\s+(.+)$/)
    if (b) { toSeg = b[1]; fromSeg = b[2] }
  }
  if (!fromSeg) {
    const c = t.match(/(.+?)\s+(?:to|into|->)\s+(.+)$/)
    if (c) { fromSeg = c[1]; toSeg = c[2] }
  }

  let from = null, to = null
  if (fromSeg) from = resolveNetwork(fromSeg)
  if (toSeg) to = resolveNetwork(toSeg)

  if (!from) missing.push("source_network")
  if (!to) missing.push("destination_network")
  if (missing.length) reasons.push("clarification_required")
  if (from && to && from === to) reasons.push("route_same_network")

  if (reasons.length) return refusal(reasons, missing)
  return Object.freeze({
    ok: true, kind: "bridge", token: "usdc", amount,
    from, to, routeVerified: isVerifiedRoute(from, to),
  })
}

function parseSwap(t) {
  const reasons = []
  const missing = []
  const amount = readAmount(t, reasons)

  if (FOREIGN_TOKENS.test(t)) {
    reasons.push("token_not_supported")
    reasons.push("dex_not_integrated")
    return refusal(reasons, [])
  }

  const named = []
  for (const m of t.matchAll(/\b(usdc|usyc)\b/g)) named.push(m[1])

  let fromToken = null, toToken = null
  if (named.length >= 2) { fromToken = named[0]; toToken = named[1] }
  else if (named.length === 1) {
    const only = named[0]
    if (only === "usyc") {
      if (REDEEM_VERBS.test(t)) { fromToken = "usyc"; toToken = "usdc" }
      else { fromToken = "usdc"; toToken = "usyc" }
    } else { missing.push("destination_token") }
  } else { missing.push("source_token"); missing.push("destination_token") }

  // USYC is issued on Arc only; naming any other network is a real conflict.
  const other = NETWORKS.filter((n) => n !== "arc")
    .find((n) => resolveNetwork(t) === n)
  if (other) reasons.push("swap_arc_only")

  if (missing.length) reasons.push("clarification_required")
  if (fromToken && toToken) {
    if (fromToken === toToken) reasons.push("pair_not_supported")
    else if (!SWAP_PAIRS.includes(fromToken + ">" + toToken)) {
      reasons.push("pair_not_supported")
      reasons.push("dex_not_integrated")
    }
  }

  if (reasons.length) return refusal(reasons, missing)
  return Object.freeze({
    ok: true, kind: "swap", network: "arc", amount, fromToken, toToken,
  })
}

// pure: natural language -> allowlisted intent. No LLM, no network, no I/O.
export function parseIntent(text) {
  const input = String(text || "")
  if (!input.trim()) return refusal(["intent_empty"], [])
  const t = input.toLowerCase().replace(/\u2192/g, "->").replace(/\s+/g, " ").trim()
  if (/\bmainnet\b/.test(t)) return refusal(["mainnet_not_supported"], [])

  const isSwap = SWAP_VERBS.test(t)
  const isBridge = BRIDGE_VERBS.test(t)
  if (isSwap && !isBridge) return parseSwap(t)
  if (isBridge) return parseBridge(t)
  return refusal(["intent_verb_unsupported"], [])
}

// Conservative testnet defaults, denominated in USDC atomic units.
export function defaultIntentCtx() {
  return {
    perTxCapAtomic: 25000000,
    dailyCapAtomic: 100000000,
    perRecipientCapAtomic: 100000000,
    spentTodayAtomic: 0,
    spentRecipientAtomic: 0,
    paused: false,
  }
}

// Caps are denominated in USDC. A USYC-denominated input has no USDC value without
// an oracle reading, so it fails closed unless the caller supplies one.
function usdcAtomicFor(parsed, ctx) {
  if (parsed.kind === "bridge") return toAtomicUsdc(parsed.amount)
  if (parsed.fromToken === "usdc") return toAtomicUsdc(parsed.amount)
  return typeof ctx.usdcValueAtomic === "number" ? ctx.usdcValueAtomic : null
}

export function evaluateIntent(text, ctx = {}) {
  const parsed = parseIntent(text)
  const sender = typeof ctx.sender === "string" ? ctx.sender.toLowerCase() : null
  const recipient = typeof ctx.recipient === "string" ? ctx.recipient.toLowerCase() : sender

  if (!parsed.ok) {
    return Object.freeze({
      allow: false, parsed, reasons: parsed.reasons, missing: parsed.missing,
      amountAtomic: 0, policyVersion: null,
      intentPolicyVersion: INTENT_POLICY_VERSION,
    })
  }

  const amountAtomic = usdcAtomicFor(parsed, ctx)
  if (amountAtomic == null) {
    return Object.freeze({
      allow: false, parsed, reasons: Object.freeze(["usdc_value_unknown"]),
      missing: Object.freeze(["usdcValueAtomic"]), amountAtomic: 0,
      policyVersion: null, intentPolicyVersion: INTENT_POLICY_VERSION,
    })
  }

  const kernelCtx = { ...defaultIntentCtx(), ...ctx, allowlist: sender ? [sender] : [] }
  const decision = evaluatePolicy({ kind: parsed.kind, amountAtomic, recipient }, kernelCtx)

  return Object.freeze({
    allow: decision.allow, parsed, reasons: decision.reasons,
    missing: Object.freeze([]), amountAtomic: decision.amountAtomic,
    policyVersion: decision.policyVersion,
    intentPolicyVersion: INTENT_POLICY_VERSION,
  })
}

// pure: build the Policy Decision Record. Refusals are recorded exactly like approvals.
export function buildIntentPdr(text, decision = {}) {
  const p = decision.parsed && decision.parsed.ok ? decision.parsed : {}
  const record = {
    v: 2,
    policy: {
      intentPolicyVersion: decision.intentPolicyVersion || INTENT_POLICY_VERSION,
      policyVersion: decision.policyVersion || null,
    },
    input: {
      kind: p.kind || null,
      intentDigest: contentHash({ text: String(text || "") }),
      route: p.kind === "bridge" ? { from: p.from, to: p.to } : null,
      pair: p.kind === "swap" ? { fromToken: p.fromToken, toToken: p.toToken } : null,
      routeVerified: p.kind === "bridge" ? p.routeVerified === true : null,
      amountAtomic: typeof decision.amountAtomic === "number" ? decision.amountAtomic : 0,
    },
    output: {
      allow: decision.allow === true,
      reasons: Array.isArray(decision.reasons) ? [...decision.reasons] : [],
      missing: Array.isArray(decision.missing) ? [...decision.missing] : [],
    },
  }
  return Object.freeze({ record, address: contentHash(record) })
}

export function verifyIntentPdr(record, address) {
  return contentHash(record) === address
}

export default {
  INTENT_POLICY_VERSION, NETWORKS, VERIFIED_ROUTES, TOKENS, SWAP_PAIRS,
  toAtomicUsdc, isVerifiedRoute, parseIntent, defaultIntentCtx,
  evaluateIntent, buildIntentPdr, verifyIntentPdr, canonicalize,
}
