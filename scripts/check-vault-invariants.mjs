// scripts/check-vault-invariants.mjs — NO MOCKS, NO STUBS.
// Reads the real deployed CronusVault on Arc over JSON-RPC and asserts solvency invariants
// against real on-chain state. Read-only: no keys, no funds, no simulated values.
// Requires ARC_RPC_URL (or ARC_RPC). Refuses to run rather than invent an endpoint.
import { createPublicClient, http, getAddress } from "viem"

const RPC = process.env.ARC_RPC_URL || process.env.ARC_RPC
if (!RPC) {
  console.error("ARC_RPC_URL (or ARC_RPC) is required. This check reads live chain state and will not fabricate it.")
  process.exit(2)
}
const VAULT = getAddress(process.env.VAULT_ADDRESS || "0x13B6984357e27dAB17DF44a6396042239e70542C")

const ABI = [
  { name: "totalAssets", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "totalShares", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "convertToAssets", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "convertToShares", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
]

const client = createPublicClient({ transport: http(RPC) })
const read = (fn, args = []) => client.readContract({ address: VAULT, abi: ABI, functionName: fn, args })

const fails = []
function check(name, ok, detail) {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " -- " + detail : ""))
  if (!ok) fails.push(name)
}

const assets = await read("totalAssets")
const shares = await read("totalShares")
console.log("vault " + VAULT + " | totalAssets " + assets + " | totalShares " + shares)

const claimable = shares > 0n ? await read("convertToAssets", [shares]) : 0n
check("I1 solvency: sum(convertToAssets) <= totalAssets", claimable <= assets, "claimable " + claimable + " vs assets " + assets)
check("I2 share price non-zero while shares exist", shares === 0n || claimable > 0n)
check("I3 no unclaimable surplus while totalShares == 0", !(shares === 0n && assets > 0n),
  shares === 0n && assets > 0n ? "DONATION EXPOSURE: " + assets + " atomic USDC stranded; next depositor mints 1:1 and dilutes itself" : "clean")

const probe = 1000000n
const sh = await read("convertToShares", [probe])
const back = sh > 0n ? await read("convertToAssets", [sh]) : 0n
check("I4 round-trip creates no free money", back <= probe, probe + " -> " + sh + " shares -> " + back)

console.log(fails.length ? "\nFAILED: " + fails.join(", ") : "\nall invariants hold on live state")
process.exit(fails.length ? 1 : 0)
