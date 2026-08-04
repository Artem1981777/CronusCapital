import fs from "fs"
import { ethers } from "ethers"

const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const SCAN = "https://testnet.arcscan.app/tx/"
const PK = process.env.OPERATOR_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY
if (!PK) { console.error("Set OPERATOR_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY)"); process.exit(1) }

const GUARD = fs.readFileSync("agent-guard-address.txt", "utf8").trim()
const abi = JSON.parse(fs.readFileSync("agent-guard-abi.json", "utf8"))
const ATTACKER = "0x000000000000000000000000000000000000dEaD" // NOT allowlisted
const U = (n) => ethers.parseUnits(String(n), 6)

const key = PK.startsWith("0x") ? PK : "0x" + PK
const provider = new ethers.JsonRpcProvider(RPC)
const wallet = new ethers.Wallet(key, provider)
const guard = new ethers.Contract(GUARD, abi, wallet)

console.log("Guard:", GUARD)
console.log("Operator:", wallet.address)
console.log("Rogue attempt: spend(attacker, 1 USDC) with manual gasLimit -> forces a real on-chain reverted tx")

// manual gasLimit skips local estimateGas, so the reverting tx is actually broadcast and mined
const tx = await guard.spend(ATTACKER, U(1), { gasLimit: 120000n })
console.log("Broadcast tx (expected to revert):", tx.hash)
console.log(SCAN + tx.hash)
try {
  const r = await tx.wait()
  console.log("Mined with status:", r.status, r.status === 0 ? "(REVERTED as designed)" : "(UNEXPECTED SUCCESS!)")
} catch (e) {
  console.log("Reverted on-chain as designed (status 0) - containment working.")
}
console.log("Open the link above: arcscan shows a red FAILED tx = the rogue attempt was rejected by the contract.")
