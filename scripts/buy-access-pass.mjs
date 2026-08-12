// scripts/buy-access-pass.mjs
// Buys one access pass with real USDC on Arc. Two transactions: approve, then mint.
// Half of the payment stays in the contract as the coverage pool, which is what turns
// backedPerPass from a promise into a number.
import { readFileSync } from "fs"
import os from "os"
import path from "path"
import { ethers } from "ethers"

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const USDC = "0x3600000000000000000000000000000000000000"

const pick = (s, k) => {
  const m = s.match(new RegExp("^" + k + "=(.+)$", "m"))
  if (!m) throw new Error("missing " + k)
  return m[1].trim()
}
const norm = (k) => (k.startsWith("0x") ? k : "0x" + k)

const env = readFileSync(path.join(os.homedir(), ".cronus-buyer.env"), "utf8")
const provider = new ethers.JsonRpcProvider(RPC, 5042002)
const wallet = new ethers.Wallet(norm(pick(env, "BUYER_PRIVATE_KEY")), provider)

const PASS = readFileSync("access-pass-address.txt", "utf8").trim()
const abi = JSON.parse(readFileSync("abi/CronusAccessPass.json", "utf8"))
const pass = new ethers.Contract(PASS, abi, wallet)
const usdc = new ethers.Contract(
  USDC,
  [
    "function approve(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
  ],
  wallet
)

console.log("buyer:", wallet.address)
console.log("pass contract:", PASS)

const bal = await usdc.balanceOf(wallet.address)
const price = await pass.price()
console.log("usdc balance:", ethers.formatUnits(bal, 6), "price:", ethers.formatUnits(price, 6))
if (bal < price) { console.error("not enough USDC to buy a pass"); process.exit(1) }

const existing = await pass.passOf(wallet.address)
if (existing !== 0n) {
  console.log("this address already holds pass #" + existing + ", nothing to buy")
  process.exit(0)
}

const allowance = await usdc.allowance(wallet.address, PASS)
if (allowance < price) {
  const a = await usdc.approve(PASS, price)
  console.log("approve sent:", a.hash)
  const ar = await provider.waitForTransaction(a.hash)
  if (ar.status !== 1) { console.error("approve reverted"); process.exit(1) }
  console.log("approve mined in block", ar.blockNumber)
}

const tx = await pass.mint()
console.log("mint sent:", tx.hash)
const rec = await provider.waitForTransaction(tx.hash)
if (rec.status !== 1) { console.error("mint reverted, tx " + tx.hash); process.exit(1) }
console.log("mint mined in block", rec.blockNumber, "gas used", rec.gasUsed.toString())

const id = await pass.passOf(wallet.address)
const cov = await pass.coverage()
console.log("")
console.log("pass id:", id.toString())
console.log("owner:", await pass.ownerOf(id))
console.log("expires at (unix):", (await pass.expiresAt(id)).toString())
console.log("has access:", await pass.hasAccess(wallet.address))
console.log("pool usdc:", ethers.formatUnits(await pass.poolUsdc(), 6))
console.log("backed per pass:", ethers.formatUnits(await pass.backedPerPass(), 6))
console.log("latest certificate:", await pass.latestCertificateStatus())
console.log("coverage live:", cov[0], "-", cov[1])
const uri = await pass.tokenURI(id)
console.log("tokenURI bytes:", uri.length, "prefix:", uri.slice(0, 40))
console.log("explorer: https://testnet.arcscan.app/tx/" + tx.hash)
