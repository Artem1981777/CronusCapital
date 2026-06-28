import { readFileSync, writeFileSync, mkdirSync } from "fs"
import solc from "solc"
import { ethers } from "ethers"

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const IDENTITY = process.env.IDENTITY_REGISTRY || "0x252cAA46b9b0648908000f6C87e0a561DB4dEb6c"
const compileOnly = process.argv.includes("--compile-only")

const file = "CronusReputation.sol"
const content = readFileSync("contracts/" + file, "utf8")
const input = {
  language: "Solidity",
  sources: { [file]: { content } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
}
const out = JSON.parse(solc.compile(JSON.stringify(input)))
const errs = (out.errors || []).filter((e) => e.severity === "error")
if (errs.length) {
  console.error("COMPILE ERRORS:\n" + errs.map((e) => e.formattedMessage).join("\n"))
  process.exit(1)
}
const C = out.contracts[file].CronusReputation
const abi = C.abi
const bytecode = "0x" + C.evm.bytecode.object
console.log("compiled OK: bytecode", (bytecode.length - 2) / 2, "bytes")
mkdirSync("abi", { recursive: true })
writeFileSync("abi/CronusReputation.json", JSON.stringify(abi, null, 2))
console.log("ABI written: abi/CronusReputation.json")

if (compileOnly) { console.log("--compile-only: stopping before deploy"); process.exit(0) }

const PK = process.env.BUYER_PRIVATE_KEY
if (!PK) { console.error("Missing BUYER_PRIVATE_KEY (source ~/.cronus-buyer.env)"); process.exit(1) }
const provider = new ethers.JsonRpcProvider(RPC)
const wallet = new ethers.Wallet(PK, provider)
console.log("deployer:", wallet.address)
const bal = await provider.getBalance(wallet.address)
console.log("deployer balance:", ethers.formatEther(bal), "(native USDC-gas)")
console.log("identityRegistry arg:", IDENTITY)

const factory = new ethers.ContractFactory(abi, bytecode, wallet)
const c = await factory.deploy(IDENTITY)
const dtx = c.deploymentTransaction()
console.log("deploy tx:", dtx.hash)
await c.waitForDeployment()
const addr = await c.getAddress()
console.log("CronusReputation deployed:", addr)
console.log("\n>>> NEXT: set REPUTATION_REGISTRY=" + addr)
