// Оффлайн-проверка Council: провайдеры подменяются fetchImpl, ключи — фейковым env.
import assert from "node:assert/strict"
import {
  runCouncil, tally, eloUpdate, parseVote, assignProviders, sliceEvidence, enrichMarket, ROLES,
} from "../lib/council/council.js"

const market = { price: 100000, changePct: 2.5, high24h: 101000, low24h: 97000, vol24h: 1234, turnover24h: 98765 }
const reply = (verdict, confidence) => ({
  json: async () => ({ choices: [{ message: { content: JSON.stringify({ verdict, confidence, rationale: "test" }) } }] }),
})
// разные ответы по роли: определяем роль по содержимому evidence в промпте
const byRole = (map) => async (url, init) => {
  const body = JSON.parse(init.body)
  const user = body.messages ? body.messages[1].content : body.messages
  if (user.includes("distFromHighPct")) return reply(...map.contrarian)
  if (user.includes("turnover24h")) return reply(...map.fundamental)
  return reply(...map.technical)
}
const ONE = { GROQ_API_KEY: "x" }
const THREE = { GROQ_API_KEY: "x", DEEPSEEK_API_KEY: "y", ANTHROPIC_API_KEY: "z" }
let n = 0

const cases = [
  ["нет ключей => НЕТ голосования, а не фейковые голоса", async () => {
    const r = await runCouncil({ topic: "BTC-USDC", market, opts: { env: {} } })
    assert.equal(r.ok, false)
    assert.equal(r.mode, "unavailable")
    assert.equal(r.reason, "no_llm_keys")
    assert.equal(r.votes.length, 0)
    assert.equal(r.synthetic, false)
  }],
  ["один ключ => честный режим single-provider-three-role", async () => {
    const r = await runCouncil({ topic: "BTC-USDC", market, opts: {
      env: ONE, fetchImpl: byRole({ technical: ["BUY", 0.8], fundamental: ["BUY", 0.6], contrarian: ["SELL", 0.7] }) } })
    assert.equal(r.mode, "single-provider-three-role")
    assert.deepEqual(r.providers, ["groq"])
    assert.equal(r.validVotes, 3)
    assert.equal(r.consensus, "BUY")
    assert.equal(r.confidence, 0.7)
    assert.deepEqual(r.dissent, ["contrarian"])
  }],
  ["три ключа => multi-provider, роли на разных моделях", async () => {
    const r = await runCouncil({ topic: "BTC-USDC", market, opts: {
      env: THREE, fetchImpl: byRole({ technical: ["BUY", 0.9], fundamental: ["SKIP", 0.5], contrarian: ["SELL", 0.6] }) } })
    assert.equal(r.mode, "multi-provider")
    assert.equal(r.providers.length, 3)
    assert.equal(r.consensus, "ABSTAIN")
    assert.equal(r.reason, "no_majority")
    assert.equal(r.confidence, null)
  }],
  ["роли получают РАЗНЫЕ данные", async () => {
    const m = enrichMarket(market)
    const t = sliceEvidence(ROLES[0], m)
    const f = sliceEvidence(ROLES[1], m)
    const c = sliceEvidence(ROLES[2], m)
    assert.equal(t.changePct, 2.5)
    assert.equal(t.turnover24h, undefined)
    assert.equal(f.turnover24h, 98765)
    assert.equal(f.changePct, undefined)
    assert.equal(c.distFromHighPct, 0.99)
    assert.equal(JSON.stringify(t) === JSON.stringify(f), false)
  }],
  ["мусорный ответ модели отбрасывается, а не чинится", async () => {
    assert.equal(parseVote("не json"), null)
    assert.equal(parseVote('{"verdict":"MAYBE","confidence":0.7}'), null)
    assert.equal(parseVote('{"verdict":"BUY","confidence":"abc"}'), null)
    assert.equal(parseVote('{"verdict":"BUY","confidence":5}').confidence, 0.05)
    assert.equal(parseVote('{"verdict":"BUY","confidence":150}'), null)
    assert.equal(parseVote('{"verdict":"BUY","confidence":-1}'), null)
    assert.equal(parseVote('{"verdict":"BUY"}'), null)
    assert.equal(parseVote('текст {"verdict":"buy","confidence":72} хвост').verdict, "BUY")
    assert.equal(parseVote('{"verdict":"BUY","confidence":72}').confidence, 0.72)
  }],
  ["все модели упали => ABSTAIN без NaN", async () => {
    const r = await runCouncil({ topic: "BTC-USDC", market, opts: {
      env: ONE, fetchImpl: async () => { throw new Error("boom") } } })
    assert.equal(r.ok, false)
    assert.equal(r.consensus, "ABSTAIN")
    assert.equal(r.confidence, null)
    assert.equal(r.errors.length, 3)
  }],
  ["один голос из трёх => недостаточно для консенсуса", async () => {
    const t = tally([{ role: "technical", verdict: "BUY", confidence: 0.9 }])
    assert.equal(t.consensus, "ABSTAIN")
    assert.equal(t.reason, "insufficient_votes")
    assert.equal(t.confidence, null)
  }],
  ["ELO против РЕАЛЬНОСТИ, а не против большинства", async () => {
    const votes = [
      { role: "technical", verdict: "BUY", confidence: 0.9 },
      { role: "fundamental", verdict: "BUY", confidence: 0.8 },
      { role: "contrarian", verdict: "SELL", confidence: 0.7 },
    ]
    const e = eloUpdate(votes, "SELL", { ratings: {} })
    assert.equal(e.applied, true)
    // одиночка, угадавший рынок, получает плюс; согласное большинство — минус
    assert.equal(e.delta.contrarian > 0, true)
    assert.equal(e.delta.technical < 0, true)
    assert.equal(e.delta.fundamental < 0, true)
    assert.equal(e.ratings.contrarian > 1200, true)
  }],
  ["без разрешённого исхода ELO не применяется", async () => {
    const e = eloUpdate([{ role: "a", verdict: "BUY", confidence: 0.9 }], null, {})
    assert.equal(e.applied, false)
    assert.equal(e.reason, "unresolved_outcome")
    assert.deepEqual(e.delta, {})
  }],
  ["распределение провайдеров детерминировано", async () => {
    assert.equal(assignProviders([], ROLES).mode, "unavailable")
    assert.equal(assignProviders(["groq"], ROLES).mode, "single-provider-three-role")
    assert.equal(assignProviders(["groq", "deepseek"], ROLES).mode, "mixed-provider")
    assert.equal(assignProviders(["groq", "deepseek", "anthropic"], ROLES).mode, "multi-provider")
  }],
]
for (const [name, fn] of cases) { await fn(); n += 1; console.log("  ok - " + name) }
console.log("\nCouncil: " + n + "/" + cases.length + " passed")
