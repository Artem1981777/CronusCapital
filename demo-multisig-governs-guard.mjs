import fs from "fs"
import os from "os"
import path from "path"
import { ethers } from "ethers"

const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const provider = new ethers.JsonRpcProvider(RPC)

const buyerEnv = fs.readFileSync(path.join(os.homedir(), ".cronus-buyer.env"), "utf8")
const coldEnv = fs.readFileSync(path.join(os.homedir(), ".cronus-cold.env"), "utf8")
const pick = (s, k) => { const m = s.match(new RegExp("^" + k + "=(.+)$", "m")); return m ? m[1].trim() : null }

const DEPLOYER_PK = pick(buyerEnv, "BUYER_PRIVATE_KEY")
const C2_PK = pick(coldEnv, "COSIGNER2_PRIVATE_KEY")
if (!DEPLOYER_PK || !C2_PK) { console.error("Missing keys"); process.exit(1) }
const norm = (k) => k.startsWith("0x") ? k : "0x" + k

const deployer = new ethers.Wallet(norm(DEPLOYER_PK), provider)
const cosigner2 = new ethers.Wallet(norm(C2_PK), provider)

const guardAddr = fs.readFileSync("agent-guard-v2-address.txt", "utf8").trim()
const msAddr = fs.readFileSync("multisig-address.txt", "utf8").trim()
const guardAbi = JSON.parse(fs.readFileSync("agent-guard-v2-abi.json", "utf8"))
const msAbi = JSON.parse(fs.readFileSync("multisig-abi.json", "utf8"))

const guardAsDeployer = new ethers.Contract(guardAddr, guardAbi, deployer)
const msDeployer = new ethers.Contract(msAddr, msAbi, deployer)
const msCosigner2 = new ethers.Contract(msAddr, msAbi, cosigner2)

let pass = 0, fail = 0
const ok = (m) => { console.log("PASS " + m); pass++ }
const no = (m) => { console.log("FAIL " + m); fail++ }

console.log("Deployer (owner1/operator/guardian):", deployer.address)
console.log("Cosigner2 (owner2, cold):", cosigner2.address)
console.log("Guard:", guardAddr, "| Multisig:", msAddr)

const bal = await provider.getBalance(cosigner2.address)
console.log("Cosigner2 native balance:", ethers.formatUnits(bal, 18), "USDC")
if (bal < ethers.parseUnits("0.1", 18)) {
  console.log("Funding cosigner2 with 0.5 USDC for gas...")
  const ftx = await deployer.sendTransaction({ to: cosigner2.address, value: ethers.parseUnits("0.5", 18) })
  await ftx.wait()
  console.log("Funded:", ftx.hash)
} else {
  console.log("Cosigner2 already has gas, skipping funding.")
}

console.log("\n[1] guardian (hot) pauses guard...")
let tx = await guardAsDeployer.pause()
await tx.wait()
if (await guardAsDeployer.paused()) ok("guard is paused by guardian")
else no("guard should be paused")

console.log("\n[2] multisig owner1 submits unpause()...")
const data = guardAsDeployer.interface.encodeFunctionData("unpause", [])
const id = await msDeployer.txCount()
tx = await msDeployer.submit(guardAddr, 0, data)
await tx.wait()
console.log("submitted tx id:", id.toString())
const t1 = await msDeployer.txs(id)
if (t1.confirmations === 1n) ok("1 confirmation after submit (auto-confirm)")
else no("expected 1 confirmation, got " + t1.confirmations)

console.log("\n[3] try execute with only 1/2 confirmations (must revert)...")
try {
  await msDeployer.execute.staticCall(id)
  no("execute should have reverted below threshold")
} catch (e) {
  ok("execute blocked below threshold: " + (e.shortMessage || e.reason || "revert"))
}
if (await guardAsDeployer.paused()) ok("guard still paused (single signature powerless)")
else no("guard should still be paused")

console.log("\n[4] cosigner2 (cold) confirms...")
tx = await msCosigner2.confirm(id)
await tx.wait()
const t2 = await msDeployer.txs(id)
if (t2.confirmations === 2n) ok("2 confirmations reached")
else no("expected 2 confirmations, got " + t2.confirmations)

console.log("\n[5] execute at threshold -> multisig unpauses guard...")
tx = await msDeployer.execute(id)
await tx.wait()
console.log("execute tx:", tx.hash)
if (!(await guardAsDeployer.paused())) ok("guard UNPAUSED by 2-of-3 multisig")
else no("guard should be unpaused")

console.log("\n[6] hot key tries guard.unpause() directly (must revert 'not owner')...")
try {
  await guardAsDeployer.unpause.staticCall()
  no("hot key unpause should revert (not owner)")
} catch (e) {
  ok("hot key blocked: " + (e.shortMessage || e.reason || "revert"))
}

console.log("\n" + pass + " passed, " + fail + " failed")
process.exit(fail === 0 ? 0 : 1)
