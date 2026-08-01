// lib/intentPolicy.js — Intent Policy Decision Records (ipdr-3).
//
// Thin hashing shell over lib/intentPolicyCore.js. The core is isomorphic and holds every
// parsing and policy rule; this file adds the content-addressed record, which depends on
// node:crypto through lib/traceArchive.js and therefore stays server-side.
//
// EVERY decision — including every refusal — becomes a record that anyone can re-hash and
// verify offline with zero keys, using the same canonicalization as the trace archive.
//
// PRIVACY. The raw intent text is never stored, only its sha256 digest.
import { canonicalize, contentHash } from "./traceArchive.js"
import {
  INTENT_POLICY_VERSION, NETWORKS, LANGUAGES, VERIFIED_ROUTES, TOKENS, SWAP_PAIRS,
  toAtomicUsdc, isVerifiedRoute, localizeIntent, parseIntent, defaultIntentCtx,
  evaluateIntent,
} from "./intentPolicyCore.js"

export * from "./intentPolicyCore.js"
export { canonicalize }

// pure: build the Policy Decision Record. Refusals are recorded exactly like approvals.
export function buildIntentPdr(text, decision = {}) {
  const p = decision.parsed && decision.parsed.ok ? decision.parsed : {}
  const record = {
    v: 3,
    policy: {
      intentPolicyVersion: decision.intentPolicyVersion || INTENT_POLICY_VERSION,
      policyVersion: decision.policyVersion || null,
    },
    input: {
      kind: p.kind || null,
      lang: decision.lang || "en",
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
  INTENT_POLICY_VERSION, NETWORKS, LANGUAGES, VERIFIED_ROUTES, TOKENS, SWAP_PAIRS,
  toAtomicUsdc, isVerifiedRoute, localizeIntent, parseIntent, defaultIntentCtx,
  evaluateIntent, buildIntentPdr, verifyIntentPdr, canonicalize,
}
