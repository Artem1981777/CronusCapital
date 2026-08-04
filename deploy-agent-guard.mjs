import fs from "fs"
import { createRequire } from "module"
import { ethers } from "ethers"
const require = createRequire(import.meta.url)
const solc = require("solc")

const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const USDC = "0x3600000000000000000000000000000000000000"
const PK = process.env.DEPLOYER_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY
if (!PK) { console.error("Set DEPLOYER_PRIVATE_KEY (or TREASURY_PRIVATE_KEY)"); process.exit(1) }

const key = PK.startsWith("0x") ? PK : "0x" + PK
const provider = new ethers.JsonRpcProvider(RPC)
const wallet = new ethers.Wallet(key, provider)

// Roles (override via env). Defaults keep everything under the deployer for a safe first deploy.
const OPERATOR = process.env.OPERATOR_ADDR || wallet.address // AI hot key
const GUARDIAN = process.env.GUARDIAN_ADDR || wallet.address // watcher
const RECOVERY = process.env.RECOVERY_ADDR || wallet.address // cold sink

// Limits in USDC (6 decimals)
const PER_TX = process.env.PER_TX_USDC || "25"
const DAILY  = process.env.DAILY_USDC  || "100"
const perTxCap = ethers.parseUnits(PER_TX, 6)
const dailyCap = ethers.parseUnits(DAILY, 6)

const source = fs.readFileSync("contracts/CronusAgentGuard.sol", "utf8")
const input = {
  language: "Solidity",
  sources: { "CronusAgentGuard.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } }
  }
}
const out = JSON.parse(solc.compile(JSON.stringify(input)))
if (out.errors) {
  let fatal = false
  for (const e of out.errors) { console.log(e.formattedMessage); if (e.severity === "error") fatal = true }
  if (fatal) process.exit(1)
}
const c = out.contracts["CronusAgentGuard.sol"].CronusAgentGuard
const abi = c.abi
const bytecode = "0x" + c.evm.bytecode.object

console.log("Deployer/owner:", wallet.address)
console.log("Operator (AI hot key):", OPERATOR)
console.log("Guardian:", GUARDIAN)
console.log("Recovery (cold):", RECOVERY)
console.log("Per-tx cap:", PER_TX, "USDC | Daily cap:", DAILY, "USDC")
const bal = await provider.getBalance(wallet.address)
console.log("Gas balance (USDC):", ethers.formatUnits(bal, 6))

if (RECOVERY.toLowerCase() === wallet.address.toLowerCase())
  console.log("WARNING: recovery == deployer. For real use set RECOVERY_ADDR to a separate cold wallet/Safe.")

const factory = new ethers.ContractFactory(abi, bytecode, wallet)
const contract = await factory.deploy(USDC, OPERATOR, GUARDIAN, RECOVERY, perTxCap, dailyCap)
console.log("Deploy tx:", contract.deploymentTransaction().hash)
await contract.waitForDeployment()
const addr = await contract.getAddress()
console.log("=== AGENT GUARD DEPLOYED ===")
console.log(addr)
fs.writeFileSync("agent-guard-abi.json", JSON.stringify(abi, null, 2))
fs.writeFileSync("agent-guard-address.txt", addr + "\n")
console.log("Saved agent-guard-abi.json + agent-guard-address.txt")
