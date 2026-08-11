// gov-add-owner.mjs — fund the new cold keys, then add the fourth cold owner.
import fs from "fs"
import os from "os"
import path from "path"
import { ethers } from "ethers"

const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const provider = new ethers.JsonRpcProvider(RPC)

const buyerEnv = fs.readFileSync(path.join(os.homedir(), ".cronus-buyer.env"), "utf8")
const coldEnv = fs.readFileSync(path.join(os.homedir(), ".cronus-cold.env"), "utf8")
const pick = (s, k) => {
  const m = s.match(new RegExp("^" + k + "=(.+)$", "m"))
  if (!m) throw new Error("missing " + k)
  return m[1].trim()
}
const norm = (k) => (k.startsWith("0x") ? k : "0x" + k)

const hot = new ethers.Wallet(norm(pick(buyerEnv, "BUYER_PRIVATE_KEY")), provider)
const c2 = new ethers.Wallet(norm(pick(coldEnv, "COSIGNER2_PRIVATE_KEY")), provider)
const WATCHER = pick(coldEnv, "WATCHER_ADDRESS")
const OWNER4 = pick(coldEnv, "OWNER4_ADDRESS")
const C3 = pick(coldEnv, "COSIGNER3_ADDRESS")

const msAddr = fs.readFileSync("multisig-address.txt", "utf8").trim()
const msAbi = JSON.parse(fs.readFileSync("multisig-abi.json", "utf8"))
const ms = new ethers.Contract(msAddr, msAbi, hot)
const msC2 = new ethers.Contract(msAddr, msAbi, c2)

const MIN = ethers.parseUnits("0.1", 18)
const TOP = ethers.parseUnits("0.5", 18)

const fund = async (addr, label) => {
  const bal = await provider.getBalance(addr)
  if (bal >= MIN) return console.log("gas ok: " + label + " " + ethers.formatUnits(bal, 18))
  const tx = await hot.sendTransaction({ to: addr, value: TOP })
  await tx.wait()
  console.log("funded " + label + ": " + tx.hash)
}

await fund(WATCHER, "watcher")
await fund(OWNER4, "owner4")
await fund(C3, "cosigner3")

console.log("before: " + (await ms.ownersCount()) + " owners, threshold " + (await ms.threshold()))

if (await ms.isOwner(OWNER4)) {
  console.log("owner4 is already an owner, nothing to submit")
} else {
  const data = ms.interface.encodeFunctionData("addOwner", [OWNER4])
  const id = await ms.txCount()
  let tx = await ms.submit(msAddr, 0, data)
  await tx.wait()
  console.log("submitted addOwner as multisig tx " + id + ": " + tx.hash)
  tx = await msC2.confirm(id)
  await tx.wait()
  console.log("cosigner2 confirmed: " + tx.hash)
  tx = await ms.execute(id)
  await tx.wait()
  console.log("executed: " + tx.hash)
}

const count = await ms.ownersCount()
const thr = await ms.threshold()
console.log("after: " + count + " owners, threshold " + thr)
if (!(await ms.isOwner(OWNER4))) throw new Error("owner4 was not added")
if (count !== 4n) throw new Error("expected 4 owners, got " + count)
if (thr !== 2n) throw new Error("threshold moved: " + thr)
console.log("OK: 2 of 4, three of them cold")
