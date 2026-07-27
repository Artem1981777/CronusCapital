// Контракт, который увидит судья: у КАЖДОГО маршрута есть ok и dataProvenance.
import assert from "node:assert/strict"
import { UPGRADE_ROUTES } from "../lib/upgrades/router.js"
import { REAL_ROUTES } from "../lib/council/routes.js"
import { ensureContract, mapContract } from "../lib/provenance/wrap.js"

const ROUTES = Object.assign({}, UPGRADE_ROUTES, REAL_ROUTES)
const call = async (h, query) => {
  let out = null, code = 200
  const res = { setHeader(){}, status(c){ code = c; return res }, json(j){ out = j; return j } }
  await h({ query: query || {}, method: "GET", headers: {} }, res)
  return { out, code }
}
let n = 0
const cases = [
  ["все маршруты отдают ok и dataProvenance, ни один не даёт 5xx", async () => {
    const kinds = Object.keys(ROUTES)
    assert.equal(kinds.length >= 11, true)
    for (const k of kinds) {
      const { out, code } = await call(ROUTES[k])
      assert.equal(code < 400, true, k + " вернул " + code)
      assert.equal(typeof out.ok, "boolean", k + ": нет булева ok")
      assert.equal(typeof out.dataProvenance, "object", k + ": нет dataProvenance")
      assert.equal(typeof out.dataProvenance.synthetic, "boolean", k + ": synthetic не булев")
      assert.equal(typeof out.kind, "string", k + ": нет kind")
    }
  }],
  ["отказ всегда помечен refusal и не синтетический", async () => {
    for (const k of ["council", "kelly", "passport", "thompson"]) {
      const { out } = await call(ROUTES[k])
      assert.equal(out.ok, false, k + " неожиданно успешен без ключей и данных")
      assert.equal(out.dataProvenance.refusal, true, k + ": отказ не помечен")
      assert.equal(typeof out.reason, "string", k + ": отказ без причины")
    }
  }],
  ["описательные заглушки честно помечены синтетическими", async () => {
    for (const k of ["shadow-float", "use-receipt", "use-registry"]) {
      const { out } = await call(REAL_ROUTES[k])
      assert.equal(out.dataProvenance.synthetic, true, k + ": не помечен синтетическим")
      assert.equal(out.ok, true)
    }
  }],
  ["исключение в обработчике не даёт 500 у судьи", async () => {
    const boom = ensureContract(async () => { throw new Error("внутренний сбой") }, { kind: "boom" })
    const { out, code } = await call(boom)
    assert.equal(code, 200)
    assert.equal(out.ok, false)
    assert.equal(out.reason, "handler_failed")
    assert.equal(out.error.includes("внутренний сбой"), true)
    assert.equal(out.dataProvenance.refusal, true)
  }],
  ["обработчик без ответа не ломает контракт", async () => {
    const silent = ensureContract(async () => {}, { kind: "silent" })
    const { out } = await call(silent)
    assert.equal(out.ok, true)
    assert.equal(typeof out.dataProvenance, "object")
  }],
  ["код ответа обработчика сохраняется", async () => {
    const four = ensureContract(async (req, res) => res.status(404).json({ reason: "нет такого" }), { kind: "four" })
    const { out, code } = await call(four)
    assert.equal(code, 404)
    assert.equal(out.ok, false)
    assert.equal(out.dataProvenance.refusal, true)
  }],
  ["уже размеченный ответ не переписывается", async () => {
    const marked = ensureContract(async (req, res) => res.status(200).json({
      ok: true, kind: "marked", dataProvenance: { synthetic: true, source: "своя метка" },
    }), { kind: "ignored" })
    const { out } = await call(marked)
    assert.equal(out.kind, "marked")
    assert.equal(out.dataProvenance.synthetic, true)
    assert.equal(out.dataProvenance.source, "своя метка")
  }],
  ["mapContract покрывает все ключи", async () => {
    const m = mapContract({ a: async (q, r) => r.json({}), b: async (q, r) => r.json({}) })
    assert.deepEqual(Object.keys(m).sort(), ["a", "b"])
    const { out } = await call(m.a)
    assert.equal(out.kind, "a")
  }],
]
for (const [name, fn] of cases) { await fn(); n += 1; console.log("  ok - " + name) }
console.log("\nContract: " + n + "/" + cases.length + " passed")
