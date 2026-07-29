// Every server module must at least load.
// Three breakages on 2026-07-29 (a duplicate in the contract, a duplicate declaration
// in a component, two export defaults in liveThompson.js) reached main precisely
// because no test ever imported this code.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readdirSync } from "node:fs"

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".js") ? [`${d}/${e.name}`] : [])

const libFiles = walk("lib").map((f) => f.slice(4))
const apiFiles = readdirSync("api").filter((f) => f.endsWith(".js"))

for (const f of libFiles) {
  test(`lib/${f} imports`, async () => {
    await assert.doesNotReject(import(`../lib/${f}`))
  })
}
for (const f of apiFiles) {
  test(`api/${f} imports`, async () => {
    await assert.doesNotReject(import(`../api/${f}`))
  })
}
