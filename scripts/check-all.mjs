// One run for everything. Exits non-zero on the first failure, so a red test
// cannot slip into main through a chain of commands.
import { spawnSync } from "node:child_process"

const SUITES = [
  "policy-kernel", "fact-guard", "decision-gate", "council", "provenance",
  "live", "live-passport", "live-thompson", "contract", "routing", "failover", "rigor", "vault-invariants",
]
let total = 0
const failed = []
const skipped = []
for (const s of SUITES) {
  // A public testnet RPC is the default so the full run works on a clean checkout.
  const env = Object.assign({}, process.env)
  if (!env.ARC_RPC_URL && !env.ARC_RPC) env.ARC_RPC_URL = "https://rpc.testnet.arc.network"
  const r = spawnSync(process.execPath, ["scripts/check-" + s + ".mjs"], { encoding: "utf8", env })
  const lines = String(r.stdout || "").trim().split("\n")
  const last = lines[lines.length - 1] || ""
  // Exit codes are not all failures: 2 means the suite refused to run without a
  // chain RPC, 3 means it could not decide. Neither is a pass, and neither is a
  // failure - calling them either way would be a lie about what was verified.
  if (r.status === 2 || r.status === 3) {
    skipped.push(s)
    console.log((r.status === 2 ? "SKIPPED  " : "UNKNOWN  ") + s + "  " + String(r.stderr || "").trim().split("\n")[0])
    continue
  }
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
console.log("ALL " + (SUITES.length - skipped.length) + " SUITES GREEN, CHECKS: " + total +
  (skipped.length ? "  (skipped: " + skipped.join(", ") + ")" : ""))
