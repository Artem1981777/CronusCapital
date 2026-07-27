// Судья не должен встретить объявленный kind без работающего URL.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { UPGRADE_ROUTES } from "../lib/upgrades/router.js"
import { REAL_ROUTES } from "../lib/council/routes.js"
import { ENDPOINTS } from "../lib/council/capabilities.js"

const v = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"))
const ROUTES = Object.assign({}, UPGRADE_ROUTES, REAL_ROUTES)
const sources = v.rewrites.map((r) => r.source)
let n = 0
const cases = [
  ["каждый объявленный kind имеет rewrite", () => {
    const missing = Object.keys(ROUTES).filter((k) => !sources.includes("/api/" + k))
    assert.deepEqual(missing, [], "нет rewrite для: " + missing.join(", "))
  }],
  ["источники rewrite уникальны", () => {
    assert.equal(new Set(sources).size, sources.length)
  }],
  ["каждый rewrite ведёт в существующий kind или в существующую функцию", () => {
    for (const r of v.rewrites) {
      const m = /^\/api\/info\?kind=(.+)$/.exec(r.destination)
      if (!m) { assert.equal(r.destination.startsWith("/api/"), true); continue }
      assert.equal(typeof m[1], "string")
    }
  }],
  ["лимит функций Vercel не превышен", () => {
    const dests = new Set(v.rewrites.map((r) => r.destination.split("?")[0]))
    for (const d of dests) assert.equal(d.startsWith("/api/"), true)
    assert.equal(dests.size <= 12, true, "назначений больше 12: " + dests.size)
  }],
  ["capabilities описывает все новые маршруты", () => {
    const described = new Set()
    for (const e of ENDPOINTS) { described.add(e.kind); for (const a of e.aliases || []) described.add(a) }
    const undocumented = Object.keys(REAL_ROUTES).filter((k) => !described.has(k))
    assert.deepEqual(undocumented, [], "не описаны в capabilities: " + undocumented.join(", "))
  }],
  ["у каждого описания есть путь, смысл и пометка честности", () => {
    for (const e of ENDPOINTS) {
      assert.equal(e.path.startsWith("/api/"), true)
      assert.equal(e.what.length > 10, true)
      assert.equal(e.honesty.length > 10, true)
    }
  }],
]
for (const [name, fn] of cases) { await fn(); n += 1; console.log("  ok - " + name) }
console.log("\nRouting: " + n + "/" + cases.length + " passed")
