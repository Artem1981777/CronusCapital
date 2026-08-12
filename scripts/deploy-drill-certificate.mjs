// scripts/deploy-drill-certificate.mjs — deploy the soulbound fire-drill certificate.
// Run with --compile-only first: it prints real compiler errors and deploys nothing.
import { readFileSync, writeFileSync, mkdirSync } from "fs"
import os from "os"
import path from "path"
import solc from "solc"
import { ethers } from "ethers"

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const compileOnly = process.argv.includes("--compile-only")

const file = "CronusDrillCertificate.sol"
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
const C = out.contracts[file].CronusDrillCertificate
const abi = C.abi
const bytecode = "0x" + C.evm.bytecode.object
console.log("compiled OK: bytecode", (bytecode.length - 2) / 2, "bytes")
mkdirSync("abi", { recursive: true })
writeFileSync("abi/CronusDrillCertificate.json", JSON.stringify(abi, null, 2))
console.log("ABI written: abi/CronusDrillCertificate.json")

if (compileOnly) { console.log("--compile-only: stopping before deploy"); process.exit(0) }

const pick = (s, k) => {
  const m = s.match(new RegExp("^" + k + "=(.+)$", "m"))
  if (!m) throw new Error("missing " + k)
  return m[1].trim()
}
const norm = (k) => (k.startsWith("0x") ? k : "0x" + k)
const buyerEnv = readFileSync(path.join(os.homedir(), ".cronus-buyer.env"), "utf8")
const coldEnv = readFileSync(path.join(os.homedir(), ".cronus-cold.env"), "utf8")

const provider = new ethers.JsonRpcProvider(RPC, 5042002)
const wallet = new ethers.Wallet(norm(pick(buyerEnv, "BUYER_PRIVATE_KEY")), provider)

const OPERATOR = wallet.address
const GUARDIAN = pick(coldEnv, "WATCHER_ADDRESS")
const HOLDER = readFileSync("multisig-address.txt", "utf8").trim()
const GUARD = readFileSync("agent-guard-v2-address.txt", "utf8").trim()

console.log("deployer / operator:", OPERATOR)
console.log("guardian (revoke only):", GUARDIAN)
console.log("holder (every certificate is minted here):", HOLDER)
console.log("guard under test:", GUARD)
console.log("gas:", (await provider.getBalance(wallet.address)).toString())

const factory = new ethers.ContractFactory(abi, bytecode, wallet)
const c = await factory.deploy(OPERATOR, GUARDIAN, HOLDER, GUARD)
console.log("deploy tx:", c.deploymentTransaction().hash)
await c.waitForDeployment()
const addr = await c.getAddress()
writeFileSync("drill-certificate-address.txt", addr + "\n")

const live = new ethers.Contract(addr, abi, provider)
console.log("deployed:", addr)
console.log("name:", await live.name(), "symbol:", await live.symbol())
console.log("operator on chain:", await live.operator())
console.log("guardian on chain:", await live.guardian())
console.log("totalSupply:", (await live.totalSupply()).toString())
console.log("explorer: https://testnet.arcscan.app/address/" + addr)
console.log("OK: address saved to drill-certificate-address.txt")
