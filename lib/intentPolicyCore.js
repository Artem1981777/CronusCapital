// lib/intentPolicyCore.js — pure intent logic, isomorphic (ipdr-3).
//
// WHY THIS FILE EXISTS. Everything here is parsing and policy evaluation, which needs no
// cryptography and no I/O, so it runs unchanged in Node and in the browser. Hashing lives
// in lib/intentPolicy.js because lib/traceArchive.js uses node:crypto, which cannot run in
// a browser. Splitting on that boundary means the dashboard and the server share ONE parser
// and ONE set of policy rules; a shipped UI can never disagree with a recorded decision.
//
// Do not import node: builtins here. That invariant is what keeps this file isomorphic.
import { evaluate as evaluatePolicy } from "./policyKernel.js"

export const INTENT_POLICY_VERSION = "ipdr-3"

export const NETWORKS = Object.freeze([
  "arc", "base", "ethereum", "arbitrum", "optimism", "avalanche",
])

export const LANGUAGES = Object.freeze(["en", "ru", "es", "pt", "fr", "de"])

// Executed by Cronus on-chain with published hashes. See docs/BRIDGE_SECURITY.md.
export const VERIFIED_ROUTES = Object.freeze(["base>arc", "arc>base"])

export const TOKENS = Object.freeze(["usdc", "usyc"])
export const SWAP_PAIRS = Object.freeze(["usdc>usyc", "usyc>usdc"])

const FOREIGN_TOKENS = /\b(eth|weth|btc|wbtc|dai|usdt|sol|matic|link|uni|aave|pepe|steth)\b/
const BRIDGE_VERBS = /\b(bridge|send|move|transfer)\b/
const SWAP_VERBS = /\b(swap|convert|exchange|buy|redeem|mint|sell)\b/
const REDEEM_VERBS = /\b(redeem|sell)\b/
const NOISE = /\b(sepolia|testnet|test|network|chain|the|on|please|my|tokens?|coins?)\b/g

// Only verbs identify a language. Prepositions are far too ambiguous across languages
// to be used for detection, so they are applied only after a verb has settled it.
const RAW_DICTS = {
  ru: {
    bridge: ["переведи", "перевести", "переведите", "перевод", "отправь", "отправить", "отправьте", "отправка", "перекинь", "перекинуть", "перемести", "переместить", "мост", "мостом", "бридж"],
    redeem: ["продай", "продать", "погаси", "погасить", "выкупи", "выкупить"],
    swap: ["обменяй", "обменять", "обменяйте", "обмен", "поменяй", "поменять", "конвертируй", "конвертировать", "конвертация"],
    buy: ["купи", "купить", "приобрести"],
    from: ["с", "со", "из", "от"],
    to: ["на", "в", "во", "к", "до"],
    mainnet: ["майннет", "мейннет", "майннете", "мейннете"],
    networks: { "арк": "arc", "арке": "arc", "база": "base", "базе": "base", "базы": "base", "бейс": "base", "бэйс": "base", "эфир": "ethereum", "эфире": "ethereum", "эфириум": "ethereum", "этериум": "ethereum", "арбитрум": "arbitrum", "арбитруме": "arbitrum", "оптимизм": "optimism", "оптимизме": "optimism", "аваланч": "avalanche", "авакс": "avalanche", "фуджи": "avalanche" },
    tokens: { "юсдс": "usdc", "юсдц": "usdc", "юсик": "usyc" },
  },
  es: {
    bridge: ["envia", "envía", "enviar", "manda", "mandar", "transfiere", "transferir", "puente"],
    redeem: ["vende", "vender", "canjea", "canjear", "rescata", "rescatar"],
    swap: ["cambia", "cambiar", "convierte", "convertir", "intercambia", "intercambiar"],
    buy: ["compra", "comprar"],
    from: ["de", "desde"],
    to: ["a", "al", "hacia", "hasta"],
    mainnet: ["mainnet"],
    networks: {},
    tokens: {},
  },
  pt: {
    bridge: ["envie", "enviar", "mande", "mandar", "transfira", "transferir", "ponte"],
    redeem: ["venda", "vender", "resgate", "resgatar"],
    swap: ["troque", "trocar", "converta", "converter"],
    buy: ["compre", "comprar"],
    from: ["de", "desde"],
    to: ["para", "ate", "até"],
    mainnet: ["mainnet"],
    networks: {},
    tokens: {},
  },
  fr: {
    bridge: ["envoie", "envoyer", "transfere", "transfère", "transferer", "transférer", "pont"],
    redeem: ["vends", "vendre", "rachete", "rachète", "racheter"],
    swap: ["echange", "échange", "echanger", "échanger", "convertis", "convertir"],
    buy: ["achete", "achète", "acheter"],
    from: ["de", "depuis"],
    to: ["a", "à", "vers"],
    mainnet: ["mainnet"],
    networks: {},
    tokens: {},
  },
  de: {
    bridge: ["sende", "senden", "schicke", "schicken", "überweise", "uberweise", "überweisen", "brücke", "brucke"],
    redeem: ["verkaufe", "verkaufen", "löse", "loese"],
    swap: ["tausche", "tauschen", "wechsle", "wechseln", "konvertiere", "konvertieren"],
    buy: ["kaufe", "kaufen"],
    from: ["von", "aus"],
    to: ["nach", "zu", "zum", "auf"],
    mainnet: ["mainnet"],
    networks: {},
    tokens: {},
  },
}

function buildDicts() {
  const out = {}
  for (const [lang, d] of Object.entries(RAW_DICTS)) {
    const map = new Map()
    const markers = new Set()
    for (const verb of ["bridge", "redeem", "swap", "buy"]) {
      for (const w of d[verb]) { map.set(w, verb); markers.add(w) }
    }
    for (const w of d.from) map.set(w, "from")
    for (const w of d.to) map.set(w, "to")
    for (const w of d.mainnet) map.set(w, "mainnet")
    for (const [k, v] of Object.entries(d.networks)) map.set(k, v)
    for (const [k, v] of Object.entries(d.tokens)) map.set(k, v)
    out[lang] = { map, markers }
  }
  return out
}

const DICTS = buildDicts()

// Russian is heavily inflected: "арбитрума", "оптимизме", "базы". Listing every case form
// is a losing game, so after an exact miss a Russian token falls back to a stem prefix.
// Order matters only where one stem could shadow another; none of these overlap.
const RU_STEMS = [
  ["арбитр", "arbitrum"],
  ["оптимиз", "optimism"],
  ["авала", "avalanche"],
  ["авакс", "avalanche"],
  ["фуджи", "avalanche"],
  ["эфир", "ethereum"],
  ["этериум", "ethereum"],
  ["бейс", "base"],
  ["бэйс", "base"],
  ["баз", "base"],
  ["арк", "arc"],
]

function ruStem(tok) {
  for (const [stem, key] of RU_STEMS) if (tok.startsWith(stem)) return key
  return null
}

// pure: Unicode-aware split. Keeps decimal points inside numbers, drops other punctuation.
function tokenize(s) {
  return s
    .split(/[^\p{L}\p{N}.]+/u)
    .map((tok) => tok.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean)
}

// pure: text -> { lang, text } where text is canonical English tokens.
export function localizeIntent(text) {
  const lowered = String(text || "")
    .toLowerCase()
    .replace(/\u2192|->/g, " to ")
  const tokens = tokenize(lowered)
  for (const lang of ["ru", "es", "pt", "fr", "de"]) {
    const d = DICTS[lang]
    if (!tokens.some((tok) => d.markers.has(tok))) continue
    const stem = lang === "ru" ? ruStem : () => null
    return { lang, text: tokens.map((tok) => d.map.get(tok) || stem(tok) || tok).join(" ") }
  }
  return { lang: "en", text: tokens.join(" ") }
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

function refusal(reasons, missing, lang) {
  return Object.freeze({
    ok: false,
    lang,
    reasons: Object.freeze(reasons),
    missing: Object.freeze(missing || []),
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

function parseBridge(t, lang) {
  const reasons = []
  const missing = []
  const amount = readAmount(t, reasons)

  let fromSeg = null, toSeg = null
  const a = t.match(/\bfrom\s+(.+?)\s+to\s+(.+)$/)
  if (a) { fromSeg = a[1]; toSeg = a[2] }
  if (!fromSeg) {
    const b = t.match(/\bto\s+(.+?)\s+from\s+(.+)$/)
    if (b) { toSeg = b[1]; fromSeg = b[2] }
  }
  if (!fromSeg) {
    const c = t.match(/(.+?)\s+to\s+(.+)$/)
    if (c) { fromSeg = c[1]; toSeg = c[2] }
  }

  let from = null, to = null
  if (fromSeg) from = resolveNetwork(fromSeg)
  if (toSeg) to = resolveNetwork(toSeg)

  if (!from) missing.push("source_network")
  if (!to) missing.push("destination_network")
  if (missing.length) reasons.push("clarification_required")
  if (from && to && from === to) reasons.push("route_same_network")

  if (reasons.length) return refusal(reasons, missing, lang)
  return Object.freeze({
    ok: true, kind: "bridge", lang, token: "usdc", amount,
    from, to, routeVerified: isVerifiedRoute(from, to),
  })
}

function parseSwap(t, lang) {
  const reasons = []
  const missing = []
  const amount = readAmount(t, reasons)

  if (FOREIGN_TOKENS.test(t)) {
    reasons.push("token_not_supported")
    reasons.push("dex_not_integrated")
    return refusal(reasons, [], lang)
  }

  const named = []
  for (const m of t.matchAll(/\b(usdc|usyc)\b/g)) named.push(m[1])

  let fromToken = null, toToken = null
  if (named.length >= 2) { fromToken = named[0]; toToken = named[1] }
  else if (named.length === 1) {
    if (named[0] === "usyc") {
      if (REDEEM_VERBS.test(t)) { fromToken = "usyc"; toToken = "usdc" }
      else { fromToken = "usdc"; toToken = "usyc" }
    } else { missing.push("destination_token") }
  } else { missing.push("source_token"); missing.push("destination_token") }

  const other = NETWORKS.filter((n) => n !== "arc").find((n) => resolveNetwork(t) === n)
  if (other) reasons.push("swap_arc_only")

  if (missing.length) reasons.push("clarification_required")
  if (fromToken && toToken) {
    if (fromToken === toToken) reasons.push("pair_not_supported")
    else if (!SWAP_PAIRS.includes(fromToken + ">" + toToken)) {
      reasons.push("pair_not_supported")
      reasons.push("dex_not_integrated")
    }
  }

  if (reasons.length) return refusal(reasons, missing, lang)
  return Object.freeze({
    ok: true, kind: "swap", lang, network: "arc", amount, fromToken, toToken,
  })
}

// pure: natural language in any supported language -> allowlisted intent. No LLM, no I/O.
export function parseIntent(text) {
  if (!String(text || "").trim()) return refusal(["intent_empty"], [], "en")
  const { lang, text: t } = localizeIntent(text)
  if (!t) return refusal(["intent_empty"], [], lang)
  if (/\bmainnet\b/.test(t)) return refusal(["mainnet_not_supported"], [], lang)

  const isSwap = SWAP_VERBS.test(t)
  const isBridge = BRIDGE_VERBS.test(t)
  if (isSwap && !isBridge) return parseSwap(t, lang)
  if (isBridge) return parseBridge(t, lang)
  return refusal(["intent_verb_unsupported"], [], lang)
}

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

// Caps are denominated in USDC. A USYC-denominated input has no USDC value without an
// oracle reading, so it fails closed unless the caller supplies one.
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
      allow: false, parsed, lang: parsed.lang, reasons: parsed.reasons,
      missing: parsed.missing, amountAtomic: 0, policyVersion: null,
      intentPolicyVersion: INTENT_POLICY_VERSION,
    })
  }

  const amountAtomic = usdcAtomicFor(parsed, ctx)
  if (amountAtomic == null) {
    return Object.freeze({
      allow: false, parsed, lang: parsed.lang,
      reasons: Object.freeze(["usdc_value_unknown"]),
      missing: Object.freeze(["usdcValueAtomic"]), amountAtomic: 0,
      policyVersion: null, intentPolicyVersion: INTENT_POLICY_VERSION,
    })
  }

  const kernelCtx = { ...defaultIntentCtx(), ...ctx, allowlist: sender ? [sender] : [] }
  const decision = evaluatePolicy({ kind: parsed.kind, amountAtomic, recipient }, kernelCtx)

  return Object.freeze({
    allow: decision.allow, parsed, lang: parsed.lang, reasons: decision.reasons,
    missing: Object.freeze([]), amountAtomic: decision.amountAtomic,
    policyVersion: decision.policyVersion,
    intentPolicyVersion: INTENT_POLICY_VERSION,
  })
}
