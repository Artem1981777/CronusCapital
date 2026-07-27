// Оффлайн-проверка DecisionGate: сеть подменяется, результат детерминирован.
import assert from "node:assert/strict"
import { runGate, withGate, OUTCOME } from "../lib/decisionGate.js"

const REF = 100000
const TO = "0x6829860b7f61FA01E5bf3D194d9f780ACa5B6787"
const H = "a".repeat(64)
const fake = (px) => async () => ({ json: async () => ({ data: { amount: String(px) } }) })
const opts = { fetchImpl: fake(100050) }
const output = { verdict: "long", spotPrice: 100000, targetPrice: 110000 }
const ctx = {
  dailyCapAtomic: 1000000, perTxCapAtomic: 10000, perRecipientCapAtomic: 250000,
  spentTodayAtomic: 0, spentRecipientAtomic: 0, allowlist: [TO],
  signalAgeSeconds: 60, maxAgeSeconds: 1800, convictionBar: 65,
}
const action = { kind: "payout", amountAtomic: 5000, recipient: TO, conviction: 70, traceHash: H }
const base = { instId: "BTC-USDC", okxPrice: REF, output, ctx, action, opts }
let n = 0

const cases = [
  ["чистый путь разрешён", async () => {
    const g = await runGate(base)
    assert.equal(g.allow, true, JSON.stringify(g.reasons))
    assert.equal(g.outcome, OUTCOME.CLEAN)
    assert.equal(g.slashable, false)
    assert.equal(g.amountAtomic, 5000)
  }],
  ["фабрикация => запрет И slashable", async () => {
    const g = await runGate({ ...base, output: { ...output, spotPrice: 95000 } })
    assert.equal(g.allow, false)
    assert.equal(g.outcome, OUTCOME.FABRICATION)
    assert.equal(g.slashable, true)
    assert.equal(g.amountAtomic, 0)
    assert.equal(g.reasons.includes("fact:fabricated_observation"), true)
  }],
  ["нет подтверждения => запрет, но НЕ slashable", async () => {
    const g = await runGate({ ...base, opts: { fetchImpl: async () => { throw new Error("down") } } })
    assert.equal(g.allow, false)
    assert.equal(g.outcome, OUTCOME.UNVERIFIABLE)
    assert.equal(g.slashable, false)
  }],
  ["превышен лимит => blocked, НЕ slashable", async () => {
    const g = await runGate({ ...base, action: { ...action, amountAtomic: 10001 } })
    assert.equal(g.allow, false)
    assert.equal(g.outcome, OUTCOME.BLOCKED)
    assert.equal(g.slashable, false)
    assert.equal(g.reasons.includes("per_tx_cap_exceeded"), true)
  }],
  ["ошибка прогноза не блокирует и не наказывается", async () => {
    const g = await runGate({ ...base, output: { ...output, targetPrice: 122000 } })
    assert.equal(g.allow, true, JSON.stringify(g.reasons))
    assert.equal(g.slashable, false)
  }],
  ["LLM не может поднять сумму через гейт", async () => {
    const g = await runGate({ ...base, advice: { amountAtomic: 9999999 } })
    assert.equal(g.amountAtomic, 5000)
    assert.equal(g.reasons.includes("advisory_raise_ignored"), true)
  }],
  ["fail-closed: пустой ctx запрещает", async () => {
    const g = await runGate({ ...base, ctx: {} })
    assert.equal(g.allow, false)
  }],
  ["паспорт получает секцию gate без мутации исходника", async () => {
    const g = await runGate(base)
    const p = { version: "1.0", decision: { verdict: "long" } }
    const wrapped = withGate(p, g, { synthetic: false, source: "okx" })
    assert.equal(wrapped.gate.present, true)
    assert.equal(wrapped.gate.outcome, "clean")
    assert.equal(wrapped.gate.observationsChecked, 1)
    assert.equal(wrapped.dataProvenance.synthetic, false)
    assert.equal(wrapped.decision.verdict, "long")
    assert.equal(p.gate, undefined, "исходный паспорт не должен мутировать")
  }],
  ["mock помечается честно", async () => {
    const wrapped = withGate({ version: "1.0" }, await runGate(base), { synthetic: true })
    assert.equal(wrapped.dataProvenance.synthetic, true)
    assert.equal(wrapped.dataProvenance.source, "mock")
  }],
  ["детерминизм", async () => {
    const a = await runGate(base)
    const b = await runGate(base)
    assert.equal(JSON.stringify(a.reasons), JSON.stringify(b.reasons))
    assert.equal(a.outcome, b.outcome)
  }],
]
for (const [name, fn] of cases) { await fn(); n += 1; console.log("  ok - " + name) }
console.log("\nDecisionGate: " + n + "/" + cases.length + " passed")
