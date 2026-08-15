import { readFileSync, writeFileSync, mkdirSync } from "fs"
import solc from "solc"
import { ethers } from "ethers"

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const compileOnly = process.argv.includes("--compile-only")

const file = "CronusDecisions.sol"
const content = readFileSync("contracts/" + file, "utf8")
const input = {
  language: "Solidity",
  sources: { [file]: { content } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
}
const out = JSON.parse(solc.compile(JSON.stringify(input)))
const errs = (out.errors || []).filter((e) => e.severity === "error")
if (errs.length) { console.error("COMPILE ERRORS:\n" + errs.map((e) => e.formattedMessage).join("\n")); process.exit(1) }
const C = out.contracts[file].CronusDecisions
const abi = C.abi
const bytecode = "0x" + C.evm.bytecode.object
console.log("compiled OK: bytecode", (bytecode.length - 2) / 2, "bytes")
mkdirSync("abi", { recursive: true })
writeFileSync("abi/CronusDecisions.json", JSON.stringify(abi, null, 2))
console.log("ABI written: abi/CronusDecisions.json")
if (compileOnly) { console.log("--compile-only: stopping before deploy"); process.exit(0) }

const PK = process.env.BUYER_PRIVATE_KEY
if (!PK) { console.error("Missing BUYER_PRIVATE_KEY (source ~/.cronus-buyer.env)"); process.exit(1) }
const provider = new ethers.JsonRpcProvider(RPC)
const wallet = new ethers.Wallet(PK, provider)
console.log("deployer:", wallet.address)
const bal = await provider.getBalance(wallet.address)
console.log("deployer balance:", ethers.formatEther(bal), "(native USDC-gas)")
const factory = new ethers.ContractFactory(abi, bytecode, wallet)
const c = await factory.deploy()
const dtx = c.deploymentTransaction()
console.log("deploy tx:", dtx.hash)
await c.waitForDeployment()
const addr = await c.getAddress()
console.log("CronusDecisions deployed:", addr)
console.log("\n>>> NEXT: set CRONUS_DECISIONS_ADDRESS=" + addr)
