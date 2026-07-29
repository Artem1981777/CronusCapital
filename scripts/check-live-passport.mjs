// Offline check of the live passport: market and models are injected.
import assert from "node:assert/strict"
import { makeLivePassport, verifyPassportAgainstRecord, legacyIntegrityDiagnosis } from "../lib/provenance/livePassport.js"
import { normalizeHash } from "../lib/provenance/wrap.js"
import { contentHash, buildTraceRecord } from "../lib/traceArchive.js"

const OKX = { json: async () => ({ data: [{ last:"100000", open24h:"97561", high24h:"101000", low24h:"97000", vol24h:"1234", volCcy24h:"98765" }] }) }
const vote = (v, c) => ({ json: async () => ({ choices: [{ message: { content: JSON.stringify({ verdict: v, confidence: c, rationale: "r" }) } }] }) })
const fetchOk = async (url) => (String(url).includes("okx.com") || String(url).includes("coinbase")) ? OKX : vote("BUY", 0.8)
const call = async (h, query) => {
  let out = null, code = null
  const res = { setHeader(){}, status(c){ code = c; return this }, json(j){ out = j; return j } }
  await h({ query: query || {}, method: "GET" }, res)
  return { out, code }
}
let n = 0
const cases = [
  ["the sha256 hash from contentHash is accepted as valid", async () => {
    const h = contentHash({ a: 1 })
    assert.equal(h.startsWith("sha256:"), true)
    assert.equal(h.length, 71)
    assert.equal(normalizeHash(h), h)
    assert.equal(normalizeHash("sha256:zzz"), null)
  }],
  ["the built-in length-66 check can never be satisfied", async () => {
    const d = legacyIntegrityDiagnosis({ verification: { traceHash: contentHash({ a: 1 }) } })
    assert.equal(d.ok, false)
    assert.equal(d.actualLength, 71)
    assert.equal(d.reason, "length_check_incompatible_with_content_hash_format")
  }],
  ["with no LLM keys no passport is issued", async () => {
    const h = makeLivePassport({ env: {}, fetchImpl: fetchOk })
    const { out } = await call(h, { instId: "BTC-USDC" })
    assert.equal(out.ok, false)
    assert.equal(out.reason, "no_llm_keys")
    assert.equal(out.passport, undefined)
  }],
  ["no market => no passport", async () => {
    const h = makeLivePassport({ env: { GROQ_API_KEY: "x" }, fetchImpl: async () => ({ json: async () => ({ data: [] }) }) })
    const { out } = await call(h, { instId: "BTC-USDC" })
    assert.equal(out.ok, false)
    assert.equal(out.reason, "market_unavailable")
  }],
  ["live passport: a real verdict, integrity CONFIRMED by recomputation", async () => {
    const h = makeLivePassport({ env: { GROQ_API_KEY: "x" }, fetchImpl: fetchOk })
    const { out } = await call(h, { instId: "BTC-USDC" })
    assert.equal(out.ok, true)
    assert.equal(out.passport.decision.verdict, "BUY")
    assert.equal(out.passport.decision.confidence, 0.8)
    assert.equal(out.passport.verification.anchored, true)
    assert.equal(out.integrityRecheck.ok, true)
    assert.equal(out.integrityRecheck.reason, "hash_matches_record")
    assert.equal(out.integrityRecheck.method, "recomputed_content_hash")
    assert.equal(out.hashFormatCheck.ok, true)
    assert.equal(out.hashFormatCheck.reason, "hash_wellformed")
    assert.equal(out.dataProvenance.synthetic, false)
    assert.equal(out.dataProvenance.live, true)
  }],
  ["the built-in validation is honestly shown as broken", async () => {
    const h = makeLivePassport({ env: { GROQ_API_KEY: "x" }, fetchImpl: fetchOk })
    const { out } = await call(h, {})
    assert.equal(out.validation.integrity, false)
    assert.equal(out.legacyIntegrityCheck.ok, false)
    assert.equal(out.integrityRecheck.ok, true)
    assert.equal(out.validation.completeness, 1)
  }],
  ["the passport carries REAL market data, not an empty object", async () => {
    const h = makeLivePassport({ env: { GROQ_API_KEY: "x" }, fetchImpl: fetchOk })
    const { out } = await call(h, {})
    assert.equal(out.passport.inputs.marketData.price, 100000)
    assert.equal(out.passport.inputs.marketData.source, "okx")
    assert.equal(out.passport.reasoning.trace.length, 3)
    assert.equal(out.traceRecord.input.instId, "BTC-USDC")
  }],
  ["tampering with the trace record is caught", async () => {
    const rec = buildTraceRecord({ instId: "BTC-USDC", price: 100000 }, { verdict: "BUY", conviction: 0.8 })
    const p = { verification: { traceHash: contentHash(rec) } }
    assert.equal(verifyPassportAgainstRecord(p, rec).ok, true)
    const tampered = JSON.parse(JSON.stringify(rec))
    tampered.output.verdict = "SELL"
    const bad = verifyPassportAgainstRecord(p, tampered)
    assert.equal(bad.ok, false)
    assert.equal(bad.reason, "hash_mismatch")
  }],
  ["a missing hash is not passed off as confirmed", async () => {
    const r = verifyPassportAgainstRecord({ verification: {} }, { a: 1 })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "trace_hash_missing")
  }],
  ["economics is not invented when configuration is absent", async () => {
    const h = makeLivePassport({ env: { GROQ_API_KEY: "x" }, fetchImpl: fetchOk })
    const { out } = await call(h, {})
    assert.equal(out.passport.economics.revenue, 0)
    assert.equal(/not measured|unmeasured/i.test(out.economicsSource), true, "economicsSource: " + out.economicsSource)
    const h2 = makeLivePassport({ env: { GROQ_API_KEY: "x", SIGNAL_PRICE: "0.02" }, fetchImpl: fetchOk })
    const r2 = await call(h2, {})
    assert.equal(r2.out.passport.economics.revenue, 0.02)
  }],
]
for (const [name, fn] of cases) { await fn(); n += 1; console.log("  ok - " + name) }
console.log("\nLivePassport: " + n + "/" + cases.length + " passed")
