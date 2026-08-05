import fs from "fs"
import os from "os"
import path from "path"
import { ethers } from "ethers"

const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const PK = process.env.DEPLOYER_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY
if (!PK) { console.error("Set DEPLOYER_PRIVATE_KEY (or TREASURY_PRIVATE_KEY)"); process.exit(1) }

const COLD = path.join(os.homedir(), ".cronus-cold.env")
const env = fs.readFileSync(COLD, "utf8")
const pick = (k) => { const m = env.match(new RegExp("^" + k + "=(.+)$", "m")); return m ? m[1].trim() : null }
const C2 = pick("COSIGNER2_ADDRESS")
const C3 = pick("COSIGNER3_ADDRESS")
if (!C2 || !C3) { console.error("Missing cosigner addresses in " + COLD); process.exit(1) }

const ART = "forge-out/CronusMultisig.sol/CronusMultisig.json"
const art = JSON.parse(fs.readFileSync(ART, "utf8"))
const abi = art.abi
let bytecode = (art.bytecode && art.bytecode.object) ? art.bytecode.object : art.bytecode
if (bytecode && !bytecode.startsWith("0x")) bytecode = "0x" + bytecode

const key = PK.startsWith("0x") ? PK : "0x" + PK
const provider = new ethers.JsonRpcProvider(RPC)
const wallet = new ethers.Wallet(key, provider)

const owners = [wallet.address, C2, C3]
const threshold = 2

console.log("Deployer / owner1:", wallet.address)
console.log("owner2 (cold):", C2)
console.log("owner3 (cold):", C3)
console.log("Threshold:", threshold, "of", owners.length)

const factory = new ethers.ContractFactory(abi, bytecode, wallet)
const c = await factory.deploy(owners, threshold)
console.log("Deploy tx:", c.deploymentTransaction().hash)
await c.waitForDeployment()
const addr = await c.getAddress()
console.log("=== CRONUS MULTISIG DEPLOYED ===")
console.log(addr)
fs.writeFileSync("multisig-abi.json", JSON.stringify(abi, null, 2))
fs.writeFileSync("multisig-address.txt", addr + "\n")
console.log("Saved multisig-abi.json + multisig-address.txt")
