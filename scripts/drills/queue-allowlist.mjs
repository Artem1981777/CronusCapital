// scripts/drills/queue-allowlist.mjs — queue extAddAllowed(treasury) through the multisig.
// The hot key is no longer a multisig owner, so this is signed by two cold co-signers.
// extAddAllowed is a rule change, so it cannot take effect for 48 hours. That delay is
// the point: we cannot widen the agent's reach faster than an observer can react.
import fs from "fs"
import os from "os"
import path from "path"
import { ethers } from "ethers"

const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const provider = new ethers.JsonRpcProvider(RPC)
const OUT = "drills-op.json"
const TARGET = "0xdc6778C5F8cC74b10aED11c48306D4Cfc5737FBD"

const coldEnv = fs.readFileSync(path.join(os.homedir(), ".cronus-cold.env"), "utf8")
const pick = (s, k) => {
  const m = s.match(new RegExp("^" + k + "=(.+)$", "m"))
  if (!m) throw new Error("missing " + k)
  return m[1].trim()
}
const norm = (k) => (k.startsWith("0x") ? k : "0x" + k)

const c2 = new ethers.Wallet(norm(pick(coldEnv, "COSIGNER2_PRIVATE_KEY")), provider)
const c3 = new ethers.Wallet(norm(pick(coldEnv, "COSIGNER3_PRIVATE_KEY")), provider)

const guardAddr = fs.readFileSync("agent-guard-v2-address.txt", "utf8").trim()
const msAddr = fs.readFileSync("multisig-address.txt", "utf8").trim()
const guardAbi = JSON.parse(fs.readFileSync("agent-guard-v2-abi.json", "utf8"))
const msAbi = JSON.parse(fs.readFileSync("multisig-abi.json", "utf8"))

const guard = new ethers.Contract(guardAddr, guardAbi, provider)
const ms = new ethers.Contract(msAddr, msAbi, c2)
const msC3 = new ethers.Contract(msAddr, msAbi, c3)

console.log("submitter (cosigner2): " + c2.address + " gas " + (await provider.getBalance(c2.address)))
console.log("confirmer (cosigner3): " + c3.address + " gas " + (await provider.getBalance(c3.address)))

const already = await guard.allowed(TARGET)
console.log("allowed(" + TARGET + ") now: " + already)
if (already) throw new Error("target is already allowlisted — nothing to queue")

if (fs.existsSync(OUT)) {
  const prev = JSON.parse(fs.readFileSync(OUT, "utf8"))
  const eta = await guard.opEta(prev.id)
  if (eta !== 0n) throw new Error("a drills op is already queued, eta " + eta)
}

const inner = guard.interface.encodeFunctionData("extAddAllowed", [TARGET])
const salt = ethers.hexlify(ethers.randomBytes(32))
const outer = guard.interface.encodeFunctionData("queue", [inner, salt])

const id = await ms.txCount()
let tx = await ms.submit(guardAddr, 0, outer)
await tx.wait()
console.log("submitted as multisig tx " + id + ": " + tx.hash)
const submitHash = tx.hash

tx = await msC3.confirm(id)
await tx.wait()
console.log("cosigner3 confirmed: " + tx.hash)
const confirmHash = tx.hash

tx = await ms.execute(id)
const rc = await tx.wait()
console.log("executed: " + tx.hash)

let opId = null
let eta = null
for (const log of rc.logs) {
  if (log.address.toLowerCase() !== guardAddr.toLowerCase()) continue
  const parsed = guard.interface.parseLog(log)
  if (!parsed || parsed.name !== "OpQueued") continue
  opId = parsed.args.id
  eta = parsed.args.eta
}
if (!opId) throw new Error("no OpQueued event found — the queue call did not take effect")
if ((await guard.opEta(opId)) === 0n) throw new Error("opEta is zero for the emitted id")

const rec = {
  op: "extAddAllowed",
  reason: "give the guard one allowlisted recipient so the remaining two fire-drill scenarios can run for real",
  guard: guardAddr,
  multisig: msAddr,
  target: TARGET,
  data: inner,
  salt: salt,
  id: opId,
  eta: Number(eta),
  etaIso: new Date(Number(eta) * 1000).toISOString(),
  multisigTx: Number(id),
  submitHash,
  confirmHash,
  executeHash: tx.hash,
}
fs.writeFileSync(OUT, JSON.stringify(rec, null, 2) + "\n")

console.log("op id: " + opId)
console.log("executable at: " + rec.etaIso + " (UTC)")
console.log("OK: queued, data and salt saved to " + OUT)
