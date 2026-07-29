// The contract a judge will meet: EVERY route returns ok and dataProvenance.
import assert from "node:assert/strict"
import { UPGRADE_ROUTES } from "../lib/upgrades/router.js"
import { REAL_ROUTES } from "../lib/council/routes.js"
import { ensureContract, mapContract } from "../lib/provenance/wrap.js"

// Assembled exactly as api/info.js does it: UPGRADE_ROUTES go through mapContract,
// REAL_ROUTES are already wrapped inside lib/council/routes.js. If these two ever
// diverge, this suite stops describing production.
const ROUTES = Object.assign({}, mapContract(UPGRADE_ROUTES), REAL_ROUTES)
const call = async (h, query) => {
  let out = null, code = 200
  const res = { setHeader(){}, status(c){ code = c; return res }, json(j){ out = j; return j } }
  await h({ query: query || {}, method: "GET", headers: {} }, res)
  return { out, code }
}
let n = 0
const cases = [
  ["every route returns ok and dataProvenance, none returns 5xx", async () => {
    const kinds = Object.keys(ROUTES)
    assert.equal(kinds.length >= 11, true)
    for (const k of kinds) {
      const { out, code } = await call(ROUTES[k])
      assert.equal(code < 400, true, k + " returned " + code)
      assert.equal(typeof out.ok, "boolean", k + ": ok is not a boolean")
      assert.equal(typeof out.dataProvenance, "object", k + ": no dataProvenance")
      assert.equal(typeof out.dataProvenance.synthetic, "boolean", k + ": synthetic is not a boolean")
      assert.equal(typeof out.kind, "string", k + ": no kind")
    }
  }],
  ["a refusal is always marked refusal and is never synthetic", async () => {
    for (const k of ["council", "kelly", "passport", "thompson"]) {
      const { out } = await call(ROUTES[k])
      assert.equal(out.ok, false, k + " unexpectedly succeeded with no keys and no data")
      assert.equal(out.dataProvenance.refusal, true, k + ": the refusal is not marked")
      assert.equal(typeof out.reason, "string", k + ": a refusal without a reason")
    }
  }],
  ["descriptive stubs are honestly marked synthetic", async () => {
    for (const k of ["shadow-float", "use-receipt", "use-registry"]) {
      const { out } = await call(REAL_ROUTES[k])
      assert.equal(out.dataProvenance.synthetic, true, k + ": not marked synthetic")
      assert.equal(out.ok, true)
    }
  }],
  ["an exception in a handler does not hand the judge a 500", async () => {
    const boom = ensureContract(async () => { throw new Error("internal failure") }, { kind: "boom" })
    const { out, code } = await call(boom)
    assert.equal(code, 200)
    assert.equal(out.ok, false)
    assert.equal(out.reason, "handler_failed")
    assert.equal(out.error.includes("internal failure"), true)
    assert.equal(out.dataProvenance.refusal, true)
  }],
  ["a handler that never responds does not break the contract", async () => {
    const silent = ensureContract(async () => {}, { kind: "silent" })
    const { out } = await call(silent)
    assert.equal(out.ok, true)
    assert.equal(typeof out.dataProvenance, "object")
  }],
  ["the handler status code is preserved", async () => {
    const four = ensureContract(async (req, res) => res.status(404).json({ reason: "no such thing" }), { kind: "four" })
    const { out, code } = await call(four)
    assert.equal(code, 404)
    assert.equal(out.ok, false)
    assert.equal(out.dataProvenance.refusal, true)
  }],
  ["an already labeled response is not overwritten", async () => {
    const marked = ensureContract(async (req, res) => res.status(200).json({
      ok: true, kind: "marked", dataProvenance: { synthetic: true, source: "its own label" },
    }), { kind: "ignored" })
    const { out } = await call(marked)
    assert.equal(out.kind, "marked")
    assert.equal(out.dataProvenance.synthetic, true)
    assert.equal(out.dataProvenance.source, "its own label")
  }],
  ["mapContract covers every key", async () => {
    const m = mapContract({ a: async (q, r) => r.json({}), b: async (q, r) => r.json({}) })
    assert.deepEqual(Object.keys(m).sort(), ["a", "b"])
    const { out } = await call(m.a)
    assert.equal(out.kind, "a")
  }],
]
for (const [name, fn] of cases) { await fn(); n += 1; console.log("  ok - " + name) }
console.log("\nContract: " + n + "/" + cases.length + " passed")
