import fs from "fs"
import { ethers } from "ethers"

const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const USDC = "0x3600000000000000000000000000000000000000"
const SCAN = "https://testnet.arcscan.app/tx/"
const PK = process.env.OPERATOR_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY
if (!PK) { console.error("Set OPERATOR_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY)"); process.exit(1) }

const GUARD = fs.readFileSync("agent-guard-address.txt", "utf8").trim()
const abi = JSON.parse(fs.readFileSync("agent-guard-abi.json", "utf8"))
const erc20 = [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)"
]

const key = PK.startsWith("0x") ? PK : "0x" + PK
const provider = new ethers.JsonRpcProvider(RPC)
const wallet = new ethers.Wallet(key, provider)
const guard = new ethers.Contract(GUARD, abi, wallet)
const usdc = new ethers.Contract(USDC, erc20, wallet)

const VENDOR = process.env.VENDOR_ADDR || "0xdc6778C5F8cC74b10aED11c48306D4Cfc5737FBD" // allowlisted
const ATTACKER = "0x000000000000000000000000000000000000dEaD"                          // NOT allowlisted
const U = (n) => ethers.parseUnits(String(n), 6)
const fmt = (v) => ethers.formatUnits(v, 6)

console.log("Guard:", GUARD)
console.log("Operator:", wallet.address)

// 1) make sure the guard holds a little USDC
let bal = await usdc.balanceOf(GUARD)
console.log("Guard USDC balance:", fmt(bal))
if (bal < U(2)) {
  console.log("Funding guard with 2 USDC ...")
  const al = await usdc.allowance(wallet.address, GUARD)
  if (al < U(2)) { const a = await usdc.approve(GUARD, U(1000)); await a.wait(); console.log("approved") }
  const f = await guard.fund(U(2)); await f.wait()
  bal = await usdc.balanceOf(GUARD)
  console.log("Guard USDC balance now:", fmt(bal))
}

// 2) allowlist the vendor (owner action)
const isAllowed = await guard.allowed(VENDOR)
if (!isAllowed) { const t = await guard.setAllowed(VENDOR, true); await t.wait(); console.log("Vendor allowlisted:", VENDOR) }
else console.log("Vendor already allowlisted:", VENDOR)

console.log("\n=== ROGUE AGENT SIMULATION ===")

// A) rogue tries to drain the whole balance to a brand-new (non-allowlisted) address
try {
  await guard.spend.staticCall(ATTACKER, bal)
  console.log("A) DRAIN TO ATTACKER: !!! NOT BLOCKED (unexpected)")
} catch (e) {
  console.log("A) DRAIN TO ATTACKER   -> BLOCKED:", (e.reason || e.shortMessage || "revert"))
}

// B) rogue tries to exceed the per-tx cap, even to an allowed address
try {
  await guard.spend.staticCall(VENDOR, U(26))
  console.log("B) OVER PER-TX CAP: !!! NOT BLOCKED (unexpected)")
} catch (e) {
  console.log("B) OVER PER-TX CAP     -> BLOCKED:", (e.reason || e.shortMessage || "revert"))
}

// C) a legitimate, within-limits payment goes through (real tx)
console.log("\n=== LEGIT BOUNDED PAYMENT ===")
const tx = await guard.spend(VENDOR, U(1))
console.log("spend(vendor, 1 USDC) tx:", tx.hash)
console.log(SCAN + tx.hash)
await tx.wait()
console.log("OK. Guard balance now:", fmt(await usdc.balanceOf(GUARD)))
console.log("\nSummary: rogue paths reverted; only a bounded, allowlisted payment succeeded.")
