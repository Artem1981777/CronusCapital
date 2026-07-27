// Оффлайн-проверка маркировки происхождения. Старые обработчики вызываются как есть.
import assert from "node:assert/strict"
import { decorate, recheckIntegrity, normalizeHash, locatePassport, wrapHandler } from "../lib/provenance/wrap.js"
import { REAL_ROUTES } from "../lib/council/routes.js"
import { PROVENANCE_ROUTES } from "../lib/provenance/routes.js"

const H64 = "a".repeat(64)
const call = async (h, req) => {
  let out = null, code = null
  const res = { setHeader(){}, status(c){ code = c; return this }, json(j){ out = j; return j } }
  await h(req || { query: {}, method: "GET" }, res)
  return { out, code }
}
let n = 0
const cases = [
  ["decorate не мутирует вход", async () => {
    const src = { kind: "x" }
    const out = decorate(src, { synthetic: true, source: "s" })
    assert.equal(src.dataProvenance, undefined)
    assert.equal(out.dataProvenance.synthetic, true)
    assert.equal(out.dataProvenance.live, false)
  }],
  ["synthetic и computation — независимые утверждения", async () => {
    const out = decorate({}, { synthetic: true, computation: "real_kelly_formula" })
    assert.equal(out.dataProvenance.synthetic, true)
    assert.equal(out.dataProvenance.computation, "real_kelly_formula")
  }],
  ["хеш из contentHash (64 hex без 0x) признаётся корректным", async () => {
    assert.equal(normalizeHash(H64), "0x" + H64)
    assert.equal(normalizeHash("0x" + H64), "0x" + H64)
    assert.equal(recheckIntegrity({ verification: { traceHash: H64 } }).ok, true)
    assert.equal(recheckIntegrity({ verification: { traceHash: "0x" + H64 } }).ok, true)
  }],
  ["мусорный и отсутствующий хеш различаются", async () => {
    assert.equal(normalizeHash("0xzz"), null)
    assert.equal(recheckIntegrity({ verification: { traceHash: "0xzz" } }).reason, "malformed_trace_hash")
    assert.equal(recheckIntegrity({ verification: {} }).reason, "trace_hash_missing")
    assert.equal(recheckIntegrity({ verification: { traceHash: H64.slice(0, 40) } }).ok, false)
  }],
  ["locatePassport находит вложенный паспорт", async () => {
    assert.equal(locatePassport({ passport: { verification: {} } }) !== null, true)
    assert.equal(locatePassport({ verification: {} }) !== null, true)
    assert.equal(locatePassport({ kind: "x" }), null)
    assert.equal(locatePassport(null), null)
  }],
  ["passport помечен synthetic и НЕ утверждает целостность", async () => {
    const { out } = await call(PROVENANCE_ROUTES.passport)
    assert.equal(out.kind, "strategy-passport")
    assert.equal(out.dataProvenance.synthetic, true)
    assert.equal(out.integrityRecheck.ok, false)
    assert.equal(out.integrityRecheck.reason, "trace_hash_missing")
    assert.equal(out.passport.decision.verdict, "BUY")
  }],
  ["kelly: формула настоящая, входные данные демо", async () => {
    const { out } = await call(PROVENANCE_ROUTES.kelly)
    assert.equal(out.dataProvenance.computation, "real_kelly_formula")
    assert.equal(out.dataProvenance.synthetic, true)
    assert.equal(typeof out.stake, "number")
  }],
  ["thompson: cold start честно назван", async () => {
    const { out } = await call(PROVENANCE_ROUTES.thompson)
    assert.equal(out.dataProvenance.inputs.includes("cold_start_prior"), true)
    assert.equal(out.distribution.params.alpha, 1)
  }],
  ["descriptive_only эндпоинты не выдают себя за данные", async () => {
    for (const k of ["shadow-float", "use-receipt"]) {
      const { out } = await call(REAL_ROUTES[k])
      assert.equal(out.dataProvenance.computation, "descriptive_only")
      assert.equal(out.dataProvenance.synthetic, true)
    }
  }],
  ["падение внутреннего обработчика => 500, а не тихий мусор", async () => {
    const boom = wrapHandler(async () => { throw new Error("boom") }, { synthetic: true })
    const { out, code } = await call(boom)
    assert.equal(code, 500)
    assert.equal(out.error, "upstream_handler_failed")
    assert.equal(out.message, "boom")
  }],
  ["meta может зависеть от запроса", async () => {
    const h = wrapHandler(async (req, res) => res.status(200).json({ ok: true }),
      (req) => ({ synthetic: !req.query.live, source: "dyn" }))
    assert.equal((await call(h, { query: {} })).out.dataProvenance.synthetic, true)
    assert.equal((await call(h, { query: { live: "1" } })).out.dataProvenance.synthetic, false)
  }],
  ["council не перекрыт обёртками", async () => {
    const { out } = await call(REAL_ROUTES.council, { query: { instId: "BTC-USDC" } })
    assert.equal(out.version === "council-2" || out.reason === "market_unavailable", true)
  }],
  ["живой kelly перекрывает обёртку заглушки", async () => {
    assert.equal(REAL_ROUTES.kelly === PROVENANCE_ROUTES.kelly, false)
    assert.equal(typeof REAL_ROUTES.kelly, "function")
    assert.equal(REAL_ROUTES["shadow-float"] === PROVENANCE_ROUTES["shadow-float"], true)
    assert.equal(REAL_ROUTES.passport === PROVENANCE_ROUTES.passport, false)
  }],
]
for (const [name, fn] of cases) { await fn(); n += 1; console.log("  ok - " + name) }
console.log("\nProvenance: " + n + "/" + cases.length + " passed")
