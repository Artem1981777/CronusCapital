// scripts/verify-contracts.mjs
// Verifies our contracts on the Arc Blockscout explorer.
//
// We do not compile locally and compare: every one of these contracts has immutable
// variables, whose values are written into the code at deploy time, so a fresh build can
// never be byte-identical to what is on chain. The explorer's verifier handles that.
//
// What we do refuse to guess is the compiler version: it is read out of the metadata
// trailer of the deployed bytecode. Optimizer settings are identical across our two build
// paths (forge and npm solc): enabled, 200 runs.
//
//   node scripts/verify-contracts.mjs --probe     report status only
//   node scripts/verify-contracts.mjs             submit everything unverified
//   node scripts/verify-contracts.mjs 0xADDR...   submit one address
import { readFileSync, existsSync } from "fs"

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const EXPLORER = "https://testnet.arcscan.app"
const probe = process.argv.includes("--probe")
const only = process.argv.find((a) => /^0x[0-9a-fA-F]{40}$/.test(a))

const readAddr = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim() : null)

const TARGETS = [
  { file: "CronusDrillCertificate.sol", name: "CronusDrillCertificate", address: readAddr("drill-certificate-address.txt") },
  { file: "CronusAccessPass.sol", name: "CronusAccessPass", address: readAddr("access-pass-address.txt") },
  { file: "CronusAgentGuardV2.sol", name: "CronusAgentGuardV2", address: readAddr("agent-guard-v2-address.txt") },
  { file: "CronusMultisig.sol", name: "CronusMultisig", address: readAddr("multisig-address.txt") },
  { file: "CronusAgentGuard.sol", name: "CronusAgentGuard", address: "0x363A585faeECC19c001978e7674EB0D52a641181" },
  { file: "CronusSwap.sol", name: "CronusSwap", address: "0x0924Dae7005FC214D3A243E4f811ae4A34607400" },
]

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  const j = await r.json()
  if (j.error) throw new Error(method + ": " + j.error.message)
  return j.result
}

// solc writes its version as the three bytes following "solc" in the CBOR metadata trailer.
function versionFromBytecode(hex) {
  const marker = "736f6c6343"
  const i = hex.lastIndexOf(marker)
  if (i === -1) return null
  const v = hex.slice(i + marker.length, i + marker.length + 6)
  if (v.length < 6) return null
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)].join(".")
}

async function isVerified(address) {
  const r = await fetch(EXPLORER + "/api/v2/addresses/" + address)
  if (!r.ok) return false
  const j = await r.json()
  return j.is_verified === true
}

let versionCache = null
async function longVersion(short) {
  if (!versionCache) {
    const r = await fetch(EXPLORER + "/api/v2/smart-contracts/verification/config")
    versionCache = (await r.json()).solidity_compiler_versions || []
  }
  const exact = versionCache.filter((v) => v.startsWith("v" + short + "+"))
  if (!exact.length) throw new Error("explorer does not offer solc " + short)
  return exact[0]
}

function standardInput(file) {
  return {
    language: "Solidity",
    sources: { [file]: { content: readFileSync("contracts/" + file, "utf8") } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  }
}

async function submit(t, longVer) {
  const fd = new FormData()
  fd.append("compiler_version", longVer)
  fd.append("license_type", "mit")
  fd.append("autodetect_constructor_args", "true")
  fd.append("files[0]", new Blob([JSON.stringify(standardInput(t.file))], { type: "application/json" }), t.name + ".json")
  const r = await fetch(EXPLORER + "/api/v2/smart-contracts/" + t.address + "/verification/via/standard-input", {
    method: "POST",
    body: fd,
  })
  return { status: r.status, text: (await r.text()).slice(0, 300) }
}

const results = []

for (const t of TARGETS) {
  if (!t.address) { results.push([t.name, "SKIP", "no address file"]); continue }
  if (only && t.address.toLowerCase() !== only.toLowerCase()) continue
  if (!existsSync("contracts/" + t.file)) { results.push([t.name, "SKIP", "no source in contracts/"]); continue }

  const onchain = await rpc("eth_getCode", [t.address, "latest"])
  if (!onchain || onchain === "0x") { results.push([t.name, "SKIP", "no code at address"]); continue }
  const short = versionFromBytecode(onchain)
  const already = await isVerified(t.address)

  console.log("\n" + t.name + "  " + t.address)
  console.log("  deployed with solc:", short || "unknown")
  console.log("  already verified:", already)

  if (already) { results.push([t.name, "OK", "already verified"]); continue }
  if (!short) { results.push([t.name, "FAIL", "cannot read compiler version from bytecode"]); continue }

  let longVer
  try { longVer = await longVersion(short) } catch (e) { results.push([t.name, "FAIL", e.message]); continue }
  console.log("  will verify as:", longVer)
  if (probe) { results.push([t.name, "READY", "would submit as " + longVer]); continue }

  const res = await submit(t, longVer)
  console.log("  submitted:", res.status, res.text)

  let ok = false
  for (let i = 0; i < 10 && !ok; i++) {
    await new Promise((r) => setTimeout(r, 6000))
    ok = await isVerified(t.address)
    process.stdout.write(ok ? "  verified\n" : "  waiting...\n")
  }
  results.push([t.name, ok ? "OK" : "PENDING", ok ? "verified" : "submitted, not confirmed within a minute"])
}

console.log("\n==== summary ====")
for (const [n, s, d] of results) console.log(s.padEnd(8), n.padEnd(24), d)
const bad = results.filter((r) => r[1] !== "OK")
console.log(
  bad.length
    ? "\n" + bad.length + " contract(s) not confirmed verified - they stay listed as unverified until they are"
    : "\nevery contract in this list is verified on the explorer"
)
