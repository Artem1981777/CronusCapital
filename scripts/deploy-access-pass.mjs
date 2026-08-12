// scripts/deploy-access-pass.mjs — deploy the access pass / parametric policy NFT.
// Terms: 2 USDC per 30 days, half of every payment stays in the contract as the
// coverage pool, coverage capped at 5 USDC per pass and suspended whenever the
// latest fire-drill certificate is stale.
import { readFileSync, writeFileSync, mkdirSync } from "fs"
import os from "os"
import path from "path"
import solc from "solc"
import { ethers } from "ethers"

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const compileOnly = process.argv.includes("--compile-only")

const USDC = "0x3600000000000000000000000000000000000000"
const TREASURY = "0xdc6778C5F8cC74b10aED11c48306D4Cfc5737FBD"
const PRICE = 2000000n
const PERIOD = 30n * 24n * 60n * 60n
const COVERAGE = 5000000n

const file = "CronusAccessPass.sol"
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
const C = out.contracts[file].CronusAccessPass
const abi = C.abi
const bytecode = "0x" + C.evm.bytecode.object
console.log("compiled OK: bytecode", (bytecode.length - 2) / 2, "bytes")
mkdirSync("abi", { recursive: true })
writeFileSync("abi/CronusAccessPass.json", JSON.stringify(abi, null, 2))
console.log("ABI written: abi/CronusAccessPass.json")

if (compileOnly) { console.log("--compile-only: stopping before deploy"); process.exit(0) }

const pick = (s, k) => {
  const m = s.match(new RegExp("^" + k + "=(.+)$", "m"))
  if (!m) throw new Error("missing " + k)
  return m[1].trim()
}
const norm = (k) => (k.startsWith("0x") ? k : "0x" + k)
const buyerEnv = readFileSync(path.join(os.homedir(), ".cronus-buyer.env"), "utf8")
const provider = new ethers.JsonRpcProvider(RPC, 5042002)
const wallet = new ethers.Wallet(norm(pick(buyerEnv, "BUYER_PRIVATE_KEY")), provider)
const CERT = readFileSync("drill-certificate-address.txt", "utf8").trim()

console.log("deployer:", wallet.address)
console.log("usdc:", USDC, "treasury:", TREASURY, "certificate:", CERT)
console.log("price:", PRICE.toString(), "period:", PERIOD.toString(), "coverage cap:", COVERAGE.toString())

const factory = new ethers.ContractFactory(abi, bytecode, wallet)
const c = await factory.deploy(USDC, TREASURY, CERT, PRICE, PERIOD, COVERAGE)
console.log("deploy tx:", c.deploymentTransaction().hash)
await c.waitForDeployment()
const addr = await c.getAddress()
writeFileSync("access-pass-address.txt", addr + "\n")

const live = new ethers.Contract(addr, abi, provider)
const cov = await live.coverage()
console.log("deployed:", addr)
console.log("name:", await live.name(), "symbol:", await live.symbol())
console.log("latest certificate status:", await live.latestCertificateStatus())
console.log("coverage live:", cov[0], "-", cov[1])
console.log("backed per pass:", (await live.backedPerPass()).toString())
console.log("explorer: https://testnet.arcscan.app/address/" + addr)
console.log("OK: address saved to access-pass-address.txt")
