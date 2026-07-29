// Offline check of the live inputs: ledger and transport are injected.
import assert from "node:assert/strict"
import { trackRecordFromLedger, sampleVerdict, maxStakeUsdc, makeLiveKelly } from "../lib/provenance/live.js"

const call = async (h, query) => {
  let out = null, code = null
  const res = { setHeader(){}, status(c){ code = c; return this }, json(j){ out = j; return j } }
  await h({ query: query || {}, method: "GET" }, res)
  return { out, code }
}
const marketFetch = async () => ({ json: async () => ({ data: [{ last:"100000", open24h:"97561", high24h:"101000", low24h:"97000", vol24h:"1234", volCcy24h:"98765" }] }) })
const REAL = [{ status: "correct" }, { status: "wrong" }, { status: "open" }]
const TWELVE = Array.from({ length: 12 }, (_, i) => ({ status: i < 7 ? "correct" : "wrong" }))
let n = 0
const cases = [
  ["an empty ledger => NO track record, not 6/10", async () => {
    const tr = trackRecordFromLedger([])
    assert.equal(tr.available, false)
    assert.equal(tr.reason, "empty_ledger")
    assert.equal(tr.hits, 0)
    assert.equal(tr.graded, 0)
  }],
  ["open positions only => nothing to grade", async () => {
    const tr = trackRecordFromLedger([{ status: "open" }, { status: "void" }])
    assert.equal(tr.available, false)
    assert.equal(tr.reason, "no_resolved_positions")
    assert.equal(tr.open, 1)
    assert.equal(tr.voided, 1)
  }],
  ["a real 1 out of 2 is counted exactly", async () => {
    const tr = trackRecordFromLedger(REAL)
    assert.equal(tr.available, true)
    assert.equal(tr.hits, 1)
    assert.equal(tr.graded, 2)
    assert.equal(tr.winRate, 0.5)
    assert.equal(tr.open, 1)
  }],
  ["a small sample is rejected by default", async () => {
    const v = sampleVerdict(trackRecordFromLedger(REAL), 10)
    assert.equal(v.ok, false)
    assert.equal(v.reason, "insufficient_sample")
    assert.equal(v.statisticallyUnreliable, true)
  }],
  ["a sufficient sample passes", async () => {
    const v = sampleVerdict(trackRecordFromLedger(TWELVE), 10)
    assert.equal(v.ok, true)
    assert.equal(v.graded, 12)
  }],
  ["the stake cap comes from configuration", async () => {
    assert.equal(maxStakeUsdc({}), 0.1)
    assert.equal(maxStakeUsdc({ STAKE_BASE_USDC: "0.02", STAKE_BAND_USDC: "0.03" }), 0.05)
  }],
  ["KV unavailable => refusal, no defaults substituted", async () => {
    const h = makeLiveKelly({ readLedger: async () => { throw new Error("kv down") }, env: {} })
    const { out } = await call(h, { confidence: "0.8" })
    assert.equal(out.ok, false)
    assert.equal(out.reason, "ledger_unreachable")
    assert.equal(out.stake, undefined)
  }],
  ["a real 1/2 track record => refuse to compute Kelly", async () => {
    const h = makeLiveKelly({ readLedger: async () => REAL, env: {} })
    const { out } = await call(h, { confidence: "0.8" })
    assert.equal(out.ok, false)
    assert.equal(out.reason, "insufficient_sample")
    assert.equal(out.trackRecord.hits, 1)
    assert.equal(out.trackRecord.graded, 2)
    assert.equal(String(JSON.stringify(out)).includes('"graded":10'), false)
  }],
  ["an explicit small-sample override => it computes, but flags the unreliability", async () => {
    const h = makeLiveKelly({ readLedger: async () => REAL, env: {} })
    const { out } = await call(h, { confidence: "0.8", acceptSmallSample: "1" })
    assert.equal(out.kind, "kelly-stake")
    assert.equal(out.dataProvenance.synthetic, false)
    assert.equal(out.dataProvenance.live, true)
    assert.equal(/statistically unreliable/i.test(out.dataProvenance.note), true, "note: " + out.dataProvenance.note)
    assert.equal(out.trackRecord.graded, 2)
  }],
  ["a sufficient sample => a live computation on real numbers", async () => {
    const h = makeLiveKelly({ readLedger: async () => TWELVE, env: {} })
    const { out } = await call(h, { confidence: "0.8", verdict: "BUY" })
    assert.equal(out.dataProvenance.live, true)
    assert.equal(out.dataProvenance.computation, "real_kelly_formula")
    assert.equal(out.trackRecord.hits, 7)
    assert.equal(out.trackRecord.graded, 12)
    assert.equal(out.confidenceUsed, 0.8)
    assert.equal(typeof out.stake === "number" || out.stake === 0, true)
  }],
  ["malformed confidence is rejected", async () => {
    const h = makeLiveKelly({ readLedger: async () => TWELVE, env: {} })
    for (const c of ["abc", "1.5", "-0.2"]) {
      const { out } = await call(h, { confidence: c })
      assert.equal(out.ok, false)
      assert.equal(out.reason, "confidence_invalid")
    }
  }],
  ["with no LLM keys, confidence is not invented", async () => {
    const h = makeLiveKelly({ readLedger: async () => TWELVE, env: {}, fetchImpl: marketFetch })
    const { out } = await call(h, { instId: "BTC-USDC" })
    assert.equal(out.ok, false)
    assert.equal(out.reason, "no_llm_keys")
    assert.equal(out.confidenceUsed, undefined)
  }],
  ["the council supplies the confidence => that is what reaches Kelly", async () => {
    const fetchImpl = async (url, init) => {
      if (String(url).includes("okx.com")) return (await marketFetch())
      return { json: async () => ({ choices: [{ message: { content: JSON.stringify({ verdict: "BUY", confidence: 0.9, rationale: "t" }) } }] }) }
    }
    const h = makeLiveKelly({ readLedger: async () => TWELVE, env: { GROQ_API_KEY: "x" }, fetchImpl })
    const { out } = await call(h, { instId: "BTC-USDC" })
    assert.equal(out.confidenceSource.startsWith("council-2:"), true)
    assert.equal(out.confidenceUsed, 0.9)
    assert.equal(out.verdictUsed, "BUY")
    assert.equal(out.council.validVotes, 3)
    assert.equal(out.dataProvenance.live, true)
  }],
]
for (const [name, fn] of cases) { await fn(); n += 1; console.log("  ok - " + name) }
console.log("\nLive: " + n + "/" + cases.length + " passed")
