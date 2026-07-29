// One run for everything. Exits non-zero on the first failure, so a red test
// cannot slip into main through a chain of commands.
import { spawnSync } from "node:child_process"

const SUITES = [
  "policy-kernel", "fact-guard", "decision-gate", "council", "provenance",
  "live", "live-passport", "live-thompson", "contract", "routing", "failover", "rigor",
]
let total = 0
const failed = []
for (const s of SUITES) {
  const r = spawnSync(process.execPath, ["scripts/check-" + s + ".mjs"], { encoding: "utf8" })
  const lines = String(r.stdout || "").trim().split("\n")
  const last = lines[lines.length - 1] || ""
  if (r.status !== 0) {
    failed.push(s)
    const err = String(r.stderr || "").trim().split("\n").filter((l) => /Assertion|Error|at file/.test(l)).slice(0, 3)
    console.log("FAILING  " + s)
    for (const e of err) console.log("        " + e.trim())
    continue
  }
  const m = /(\d+)\/(\d+) passed/.exec(last)
  if (m) total += Number(m[1])
  console.log("ok      " + last)
}
console.log("")
if (failed.length) {
  console.log("SUITES FAILED: " + failed.length + " (" + failed.join(", ") + ")")
  process.exit(1)
}
console.log("ALL " + SUITES.length + " SUITES GREEN, CHECKS: " + total)
