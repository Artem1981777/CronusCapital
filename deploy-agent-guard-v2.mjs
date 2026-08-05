import fs from "fs"
import { ethers } from "ethers"

const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const PK = process.env.DEPLOYER_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY
if (!PK) { console.error("Set DEPLOYER_PRIVATE_KEY (or TREASURY_PRIVATE_KEY)"); process.exit(1) }

const ART = "forge-out/CronusAgentGuardV2.sol/CronusAgentGuardV2.json"
const art = JSON.parse(fs.readFileSync(ART, "utf8"))
const abi = art.abi
let bytecode = (art.bytecode && art.bytecode.object) ? art.bytecode.object : art.bytecode
if (bytecode && !bytecode.startsWith("0x")) bytecode = "0x" + bytecode

const key = PK.startsWith("0x") ? PK : "0x" + PK
const provider = new ethers.JsonRpcProvider(RPC)
const wallet = new ethers.Wallet(key, provider)

const U = (n) => ethers.parseUnits(String(n), 6)
const fmt = (v) => ethers.formatUnits(v, 6)

const USDC     = process.env.USDC_ADDR     || "0x3600000000000000000000000000000000000000"
const OWNER    = process.env.OWNER_ADDR    || wallet.address   // use an M-of-N Safe in prod
const OPERATOR = process.env.OPERATOR_ADDR || wallet.address
const GUARDIAN = process.env.GUARDIAN_ADDR || wallet.address
const RECOVERY = process.env.RECOVERY_ADDR || wallet.address    // immutable cold exit sink
const PER_TX     = U(process.env.PER_TX_USDC     || 25)
const DAILY      = U(process.env.DAILY_USDC      || 100)
const MAX_PER_TX = U(process.env.MAX_PER_TX_USDC || 50)
const MAX_DAILY  = U(process.env.MAX_DAILY_USDC  || 500)
const DELAY      = BigInt(process.env.TIMELOCK_SECONDS || 172800) // default 2 days

console.log("Deployer:", wallet.address)
console.log("Owner (use a Safe multisig in prod):", OWNER)
console.log("Operator (AI hot key):", OPERATOR)
console.log("Guardian (negative power only):", GUARDIAN)
console.log("Recovery (immutable cold exit):", RECOVERY)
console.log(`Caps: perTx ${fmt(PER_TX)} / daily ${fmt(DAILY)} USDC`)
console.log(`Hard caps (immutable): perTx ${fmt(MAX_PER_TX)} / daily ${fmt(MAX_DAILY)} USDC`)
console.log("Timelock delay (s):", DELAY.toString())

if (OWNER.toLowerCase() === wallet.address.toLowerCase())
  console.log("WARNING: owner == deployer. For real use set OWNER_ADDR to an M-of-N Safe.")
if (RECOVERY.toLowerCase() === wallet.address.toLowerCase())
  console.log("WARNING: recovery == deployer. For real use set RECOVERY_ADDR to a separate cold wallet/Safe.")

const factory = new ethers.ContractFactory(abi, bytecode, wallet)
const c = await factory.deploy(USDC, OWNER, OPERATOR, GUARDIAN, RECOVERY, PER_TX, DAILY, MAX_PER_TX, MAX_DAILY, DELAY)
console.log("Deploy tx:", c.deploymentTransaction().hash)
await c.waitForDeployment()
const addr = await c.getAddress()
console.log("=== AGENT GUARD V2 DEPLOYED ===")
console.log(addr)
fs.writeFileSync("agent-guard-v2-abi.json", JSON.stringify(abi, null, 2))
fs.writeFileSync("agent-guard-v2-address.txt", addr + "\n")
console.log("Saved agent-guard-v2-abi.json + agent-guard-v2-address.txt")

