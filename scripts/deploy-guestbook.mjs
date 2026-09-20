import fs from "fs"
import { createRequire } from "module"
import { ethers } from "ethers"
const require = createRequire(import.meta.url)
const solc = require("solc")

const RPC = process.env.RPC_URL || "https://rpc.mainnet.arc.io"
const PK = process.env.TREASURY_PRIVATE_KEY
if (!PK) { console.error("Set TREASURY_PRIVATE_KEY"); process.exit(1) }
const IDENTITY_REGISTRY = process.env.IDENTITY_REGISTRY || "0x5B179bFF284a17a5C8C3ccaDed1984949B410522"

const source = fs.readFileSync("contracts/CronusGuestbook.sol", "utf8")
const input = {
  language: "Solidity",
  sources: { "CronusGuestbook.sol": { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } }
}
const out = JSON.parse(solc.compile(JSON.stringify(input)))
if (out.errors) {
  let fatal = false
  for (const e of out.errors) { console.log(e.formattedMessage); if (e.severity === "error") fatal = true }
  if (fatal) process.exit(1)
}
const c = out.contracts["CronusGuestbook.sol"].CronusGuestbook
const abi = c.abi
const bytecode = "0x" + c.evm.bytecode.object

const provider = new ethers.JsonRpcProvider(RPC)
const key = PK.startsWith("0x") ? PK : "0x" + PK
const wallet = new ethers.Wallet(key, provider)
console.log("Deployer:", wallet.address)
const bal = await provider.getBalance(wallet.address)
console.log("Gas balance (USDC):", ethers.formatUnits(bal, 6))

const factory = new ethers.ContractFactory(abi, bytecode, wallet)
const contract = await factory.deploy(IDENTITY_REGISTRY)
console.log("Deploy tx:", contract.deploymentTransaction().hash)
await contract.waitForDeployment()
const addr = await contract.getAddress()
console.log("=== GUESTBOOK DEPLOYED ===")
console.log(addr)
fs.writeFileSync("guestbook-abi.json", JSON.stringify(abi, null, 2))
fs.writeFileSync("guestbook-address.txt", addr + "\n")
console.log("Saved guestbook-abi.json + guestbook-address.txt")
