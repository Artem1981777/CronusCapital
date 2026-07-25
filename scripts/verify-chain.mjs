#!/usr/bin/env node
// scripts/verify-chain.mjs - zero-key verification of the m2m ledger hash chain.
// Every entry pins the sha256 of the previous entry; editing history breaks every link after it.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
const DIR = "m2m-ledger"
const entryHash = (e) => "sha256:" + crypto.createHash("sha256").update(JSON.stringify(e)).digest("hex")
const files = fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
let prev = "sha256:genesis"
let linked = 0, legacy = 0, broken = 0
for (const f of files) {
  let arr = []
  try { arr = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) } catch (_) { continue }
  for (const e of arr) {
    if (!e.chain || !e.chain.prev) { legacy++; prev = entryHash(e); continue }
    if (e.chain.prev === prev) linked++
    else { broken++; console.log("[chain] BROKEN at " + f + " ts=" + e.ts + " | expected " + prev + " | got " + e.chain.prev) }
    prev = entryHash(e)
  }
}
console.log("[chain] " + linked + " linked, " + legacy + " legacy (pre-chain), " + broken + " broken | head " + prev)
process.exit(broken ? 1 : 0)
