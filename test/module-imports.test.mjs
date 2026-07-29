// Каждый серверный модуль должен хотя бы загружаться.
// Три поломки 29.07.2026 (дубль в контракте, дубль объявления в компоненте,
// два export default в liveThompson.js) доехали до main именно потому,
// что ни один тест не импортировал этот код.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readdirSync } from "node:fs"

const libFiles = readdirSync("lib").filter((f) => f.endsWith(".js"))
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
