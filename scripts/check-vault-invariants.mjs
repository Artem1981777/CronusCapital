// scripts/check-vault-invariants.mjs — NO MOCKS, NO STUBS.
// Asserts solvency invariants against the REAL deployed CronusVault via raw eth_call.
// The public Arc testnet RPC rate-limits eth_call (-32011), so calls are strictly
// sequential with spacing and exponential backoff. Nothing is simulated: a call that
// cannot be completed is reported as UNKNOWN, never guessed.
import { encodeFunctionData, decodeAbiParameters } from "viem"

const RPC = process.env.ARC_RPC_URL || process.env.ARC_RPC
if (!RPC) { console.error("ARC_RPC_URL (or ARC_RPC) is required; this check will not fabricate chain state."); process.exit(2) }
const VAULT = process.env.VAULT_ADDRESS || "0x13B6984357e27dAB17DF44a6396042239e70542C"
const GAP = Number(process.env.RPC_GAP_MS || 1200)

const ABI = [
  { name: "totalAssets", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "totalShares", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "convertToAssets", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "convertToShares", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let id = 0

async function ethCall(functionName, args) {
  const data = encodeFunctionData({ abi: ABI, functionName, args: args || [] })
  let wait = 2000
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "eth_call", params: [{ to: VAULT, data }, "latest"] }),
    })
    const j = await r.json().catch(() => null)
    if (j && j.result && j.result !== "0x") {
      return decodeAbiParameters([{ type: "uint256" }], j.result)[0]
    }
    const msg = j && j.error ? (j.error.message || JSON.stringify(j.error)) : "empty result (HTTP " + r.status + ")"
    if (attempt === 5) throw new Error(functionName + ": " + msg)
    console.log("  retry " + attempt + "/4 for " + functionName + " (" + msg + "), waiting " + wait + "ms")
    await sleep(wait)
    wait *= 2
  }
}

const fails = []
const unknown = []
function check(name, ok, detail) {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " -- " + detail : ""))
  if (!ok) fails.push(name)
}

try {
  const assets = await ethCall("totalAssets"); await sleep(GAP)
  const shares = await ethCall("totalShares"); await sleep(GAP)
  console.log("vault " + VAULT + " | totalAssets " + assets + " | totalShares " + shares + "\n")

  let claimable = 0n
  if (shares > 0n) { claimable = await ethCall("convertToAssets", [shares]); await sleep(GAP) }

  check("I1 solvency: convertToAssets(totalShares) <= totalAssets", claimable <= assets, "claimable " + claimable + " vs assets " + assets)
  check("I2 share price non-zero while shares exist", shares === 0n || claimable > 0n)
  check("I3 no unclaimable surplus while totalShares == 0", !(shares === 0n && assets > 0n),
    shares === 0n && assets > 0n
      ? "DONATION EXPOSURE LIVE: " + assets + " atomic USDC stranded; the next depositor mints 1:1 and dilutes itself"
      : "clean")

  const probe = 1000000n
  const sh = await ethCall("convertToShares", [probe]); await sleep(GAP)
  let back = 0n
  if (sh > 0n) back = await ethCall("convertToAssets", [sh])
  check("I4 round-trip creates no free money", back <= probe, probe + " -> " + sh + " shares -> " + back)
} catch (e) {
  unknown.push(String((e && e.message) || e))
}

if (unknown.length) console.log("\nUNKNOWN (RPC unavailable, nothing assumed): " + unknown.join("; "))
console.log(fails.length ? "\nFAILED: " + fails.join(", ") : (unknown.length ? "\nincomplete" : "\nall invariants hold on live state"))
process.exit(fails.length ? 1 : (unknown.length ? 3 : 0))
