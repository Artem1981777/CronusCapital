// scripts/verify-exact.mjs — verify the two forge-built contracts with their EXACT forge settings.
import { readFileSync } from "fs"
const EXPLORER = "https://testnet.arcscan.app"
const COMPILER = "v0.8.36+commit.8a079791"
const TARGETS = [
  { name: "CronusAgentGuardV2", address: "0xeA4788164c63B0EF2788d9c74859B43f42BC391E", unit: "contracts/CronusAgentGuardV2.sol" },
  { name: "CronusMultisig",     address: "0xde8874C53D82a38c1c2864ea575f9E62Dc29dA5F", unit: "contracts/CronusMultisig.sol" },
]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function isVerified(a) {
  try { const r = await fetch(EXPLORER + "/api/v2/addresses/" + a); if (!r.ok) return null; const j = await r.json(); return j.is_verified === true } catch { return null }
}
function standardInput(unit, content) {
  return { language: "Solidity", sources: { [unit]: { content } }, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "shanghai", metadata: { bytecodeHash: "ipfs" }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } }
}
async function submit(t) {
  const input = standardInput(t.unit, readFileSync(t.unit, "utf8"))
  const fd = new FormData()
  fd.append("compiler_version", COMPILER)
  fd.append("license_type", "mit")
  fd.append("autodetect_constructor_args", "true")
  fd.append("files[0]", new Blob([JSON.stringify(input)], { type: "application/json" }), "input.json")
  const r = await fetch(EXPLORER + "/api/v2/smart-contracts/" + t.address + "/verification/via/standard-input", { method: "POST", body: fd })
  return r.status + " " + (await r.text()).slice(0, 200)
}
for (const t of TARGETS) {
  console.log("\n=== " + t.name + " " + t.address)
  if (await isVerified(t.address) === true) { console.log("already verified"); continue }
  console.log("evmVersion=shanghai, unit=" + t.unit)
  console.log("submit: " + await submit(t))
  let ok = false
  for (let i = 0; i < 20; i++) { await sleep(6000); if (await isVerified(t.address) === true) { ok = true; break } process.stdout.write(".") }
  console.log(ok ? "\nVERIFIED ✓" : "\nне подтвердилось за 2 мин")
}
console.log("\n=== ФИНАЛЬНАЯ ПЕРЕПРОВЕРКА ===")
