// A dead key must not cost the council a vote, and the substitution must not be hidden.
import assert from "node:assert/strict"
import { runCouncil } from "../lib/council/council.js"

const market = { price: 100, changePct: 1, high24h: 101, low24h: 99 }
// groq answers, anthropic is always empty: exactly the Cronus Capital situation.
const makeFetch = (deadProviders) => async (url, init) => {
  const dead = deadProviders.some((d) => String(url).includes(d))
  if (dead) return { ok: true, json: async () => ({ content: [] }) }
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ verdict: "BUY", confidence: 0.7, rationale: "live provider" }) } }] }),
  }
}
const env = { GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "a" }
let n = 0
const cases = [
  ["a dead provider does not cost the council a vote", async () => {
    const r = await runCouncil({ topic: "BTC", market, opts: { env, fetchImpl: makeFetch(["anthropic.com"]) } })
    assert.equal(r.validVotes, 3, "expected three votes, got " + r.validVotes)
    assert.equal(r.consensus, "BUY")
  }],
  ["the provider substitution is recorded in failover", async () => {
    const r = await runCouncil({ topic: "BTC", market, opts: { env, fetchImpl: makeFetch(["anthropic.com"]) } })
    assert.equal(r.failover.length, 1)
    assert.equal(r.failover[0].from, "anthropic")
    assert.equal(r.failover[0].to, "groq")
    assert.equal(r.failover[0].reason, "empty_response")
    assert.equal(typeof r.failover[0].role, "string")
  }],
  ["after a re-vote, providers reflects reality", async () => {
    const r = await runCouncil({ topic: "BTC", market, opts: { env, fetchImpl: makeFetch(["anthropic.com"]) } })
    assert.deepEqual(r.providers, ["groq"])
    assert.deepEqual(r.providersFailed, [])
    assert.equal(r.providersAttempted.includes("anthropic"), true)
    assert.equal(r.mode, "single-provider-effective")
    assert.equal(r.modePlanned, "mixed-provider")
  }],
  ["every vote names who cast it", async () => {
    const r = await runCouncil({ topic: "BTC", market, opts: { env, fetchImpl: makeFetch(["anthropic.com"]) } })
    for (const v of r.votes) { assert.equal(v.provider, "groq"); assert.equal(typeof v.model, "string") }
    assert.deepEqual(r.votes.map((v) => v.role).sort(), ["contrarian", "fundamental", "technical"])
  }],
  ["with no live providers there are no votes and no substitution", async () => {
    const r = await runCouncil({ topic: "BTC", market, opts: { env, fetchImpl: makeFetch(["anthropic.com", "groq.com"]) } })
    assert.equal(r.validVotes, 0)
    assert.equal(r.ok, false)
    assert.deepEqual(r.failover, [])
    assert.equal(r.mode, "no-valid-votes")
    assert.equal(r.consensus, "ABSTAIN")
  }],
  ["the re-vote can be switched off", async () => {
    const r = await runCouncil({ topic: "BTC", market, opts: { env, fetchImpl: makeFetch(["anthropic.com"]), failover: false } })
    assert.equal(r.validVotes, 2)
    assert.deepEqual(r.providersFailed, ["anthropic"])
    assert.deepEqual(r.failover, [])
  }],
  ["a single provider works with no substitutions", async () => {
    const r = await runCouncil({ topic: "BTC", market, opts: { env: { GROQ_API_KEY: "g" }, fetchImpl: makeFetch([]) } })
    assert.equal(r.validVotes, 3)
    assert.deepEqual(r.failover, [])
    assert.equal(r.mode, "single-provider-three-role")
  }],
]
for (const [name, fn] of cases) { await fn(); n += 1; console.log("  ok - " + name) }
console.log("\nFailover: " + n + "/" + cases.length + " passed")
