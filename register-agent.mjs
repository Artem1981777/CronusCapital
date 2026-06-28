import fs from "fs"
import { ethers } from "ethers"

const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const PK = process.env.TREASURY_PRIVATE_KEY
if (!PK) { console.error("Set TREASURY_PRIVATE_KEY"); process.exit(1) }

const abi = JSON.parse(fs.readFileSync("identity-abi.json", "utf8"))
const address = fs.readFileSync("identity-address.txt", "utf8").trim()
const AGENT_DOMAIN = process.env.AGENT_DOMAIN || "cronus-capital.vercel.app"
const METADATA_URI = process.env.METADATA_URI || "https://cronus-capital.vercel.app/api/manifest"

const provider = new ethers.JsonRpcProvider(RPC)
const key = PK.startsWith("0x") ? PK : "0x" + PK
const wallet = new ethers.Wallet(key, provider)
const registry = new ethers.Contract(address, abi, wallet)
const agentAddress = process.env.AGENT_ADDRESS || wallet.address

console.log("Registry:", address)
console.log("Registering:", agentAddress, "| domain:", AGENT_DOMAIN)

if (await registry.isRegistered(agentAddress)) {
  const a = await registry.resolveByAddress(agentAddress)
  console.log("Already registered. agentId:", a.agentId.toString(), "metadataURI:", a.metadataURI)
  process.exit(0)
}
const tx = await registry.register(agentAddress, AGENT_DOMAIN, METADATA_URI)
console.log("register tx:", tx.hash)
const rcpt = await tx.wait()
console.log("mined in block:", rcpt.blockNumber)
const a = await registry.resolveByAddress(agentAddress)
console.log("=== REGISTERED ===")
console.log("agentId:", a.agentId.toString())
console.log("agentAddress:", a.agentAddress)
console.log("agentDomain:", a.agentDomain)
console.log("metadataURI:", a.metadataURI)
console.log("owner:", a.owner)
