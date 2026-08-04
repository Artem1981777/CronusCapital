import fs from "fs"
import { ethers } from "ethers"

const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const PK = process.env.OWNER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY
if (!PK) { console.error("Set OWNER_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY)"); process.exit(1) }

const GUARD = fs.readFileSync("agent-guard-address.txt", "utf8").trim()
const abi = JSON.parse(fs.readFileSync("agent-guard-abi.json", "utf8"))
const VENDOR = process.env.VENDOR_ADDR || "0xdc6778C5F8cC74b10aED11c48306D4Cfc5737FBD"
const ATTACKER = "0x000000000000000000000000000000000000dEaD"
const U = (n) => ethers.parseUnits(String(n), 6)

const key = PK.startsWith("0x") ? PK : "0x" + PK
const provider = new ethers.JsonRpcProvider(RPC)
const owner = new ethers.Wallet(key, provider)
const guard = new ethers.Contract(GUARD, abi, owner)

// Separate role holders. Keys are NOT needed: powers are proven via eth_call with a from-override.
const OPERATOR = process.env.OPERATOR_ADDR || ethers.Wallet.createRandom().address
const GUARDIAN = process.env.GUARDIAN_ADDR || ethers.Wallet.createRandom().address

console.log("Owner:", owner.address)
console.log("Operator (separate hot key):", OPERATOR)
console.log("Guardian (separate watcher):", GUARDIAN)

async function expectRevert(label, p) {
  try { await p; console.log(`  ${label}: !!! NOT blocked (unexpected)`) }
  catch (e) { console.log(`  ${label}: BLOCKED -> ${e.reason || e.shortMessage || "revert"}`) }
}
async function expectOk(label, p) {
  try { const r = await p; console.log(`  ${label}: OK${r === undefined ? "" : " -> " + r}`) }
  catch (e) { console.log(`  ${label}: !!! FAILED -> ${e.reason || e.shortMessage || "revert"}`) }
}

console.log("\nAssigning split roles on-chain...")
let t = await guard.setOperator(OPERATOR); await t.wait(); console.log("  operator set")
t = await guard.setGuardian(GUARDIAN); await t.wait(); console.log("  guardian set")
if (!(await guard.allowed(VENDOR))) { t = await guard.setAllowed(VENDOR, true); await t.wait(); console.log("  vendor allowlisted") }

console.log("\n=== OPERATOR (AI hot key) powers ===")
await expectOk    ("spend(vendor, 1 USDC)     ", guard.spend.staticCall(VENDOR, U(1), { from: OPERATOR }))
await expectRevert("sweepToRecovery()         ", guard.sweepToRecovery.staticCall({ from: OPERATOR }))
await expectRevert("setAllowed(attacker,true) ", guard.setAllowed.staticCall(ATTACKER, true, { from: OPERATOR }))
await expectRevert("setLimits(huge,huge)      ", guard.setLimits.staticCall(U(1000000), U(1000000), { from: OPERATOR }))
await expectRevert("pause() as operator       ", guard.pause.staticCall({ from: OPERATOR }))

console.log("\n=== GUARDIAN (watcher) powers ===")
await expectOk    ("pause()                   ", guard.pause.staticCall({ from: GUARDIAN }))
await expectRevert("unpause() (owner-only)    ", guard.unpause.staticCall({ from: GUARDIAN }))

console.log("\nRestoring roles to owner (safe default)...")
t = await guard.setOperator(owner.address); await t.wait()
t = await guard.setGuardian(owner.address); await t.wait()
console.log("  roles restored to owner")

console.log("\nSummary: the operator can ONLY make bounded, allowlisted payments - it cannot sweep, change limits/allowlist, or pause. The guardian can pause but not unpause. Only the owner controls the funds.")
