// gov-queue-guardian.mjs — queue extSetGuardian(watcher) through the multisig.
import fs from "fs"
import os from "os"
import path from "path"
import { ethers } from "ethers"

const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const provider = new ethers.JsonRpcProvider(RPC)
const OUT = "governance-op.json"

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

const guardAddr = fs.readFileSync("agent-guard-v2-address.txt", "utf8").trim()
const msAddr = fs.readFileSync("multisig-address.txt", "utf8").trim()
const guardAbi = JSON.parse(fs.readFileSync("agent-guard-v2-abi.json", "utf8"))
const msAbi = JSON.parse(fs.readFileSync("multisig-abi.json", "utf8"))

const guard = new ethers.Contract(guardAddr, guardAbi, provider)
const ms = new ethers.Contract(msAddr, msAbi, hot)
const msC2 = new ethers.Contract(msAddr, msAbi, c2)

const current = await guard.guardian()
console.log("guardian now: " + current)
console.log("guardian target: " + WATCHER)
if (current.toLowerCase() === WATCHER.toLowerCase()) throw new Error("guardian already the watcher")

if (fs.existsSync(OUT)) {
  const prev = JSON.parse(fs.readFileSync(OUT, "utf8"))
  const eta = await guard.opEta(prev.id)
  if (eta !== 0n) throw new Error("an op is already queued, eta " + eta + " — nothing to do")
}

const inner = guard.interface.encodeFunctionData("extSetGuardian", [WATCHER])
const salt = ethers.hexlify(ethers.randomBytes(32))
const outer = guard.interface.encodeFunctionData("queue", [inner, salt])

const id = await ms.txCount()
let tx = await ms.submit(guardAddr, 0, outer)
await tx.wait()
console.log("submitted queue as multisig tx " + id + ": " + tx.hash)
tx = await msC2.confirm(id)
await tx.wait()
console.log("cosigner2 confirmed: " + tx.hash)
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

const onchain = await guard.opEta(opId)
if (onchain === 0n) throw new Error("opEta is zero for the emitted id")

const rec = {
  op: "extSetGuardian",
  reason: "split the pause role away from the hot operator key",
  guard: guardAddr,
  multisig: msAddr,
  newGuardian: WATCHER,
  previousGuardian: current,
  data: inner,
  salt: salt,
  id: opId,
  eta: Number(eta),
  etaIso: new Date(Number(eta) * 1000).toISOString(),
  queuedByMultisigTx: tx.hash,
}
fs.writeFileSync(OUT, JSON.stringify(rec, null, 2) + "\n")

console.log("op id: " + opId)
console.log("executable at: " + rec.etaIso + " (UTC)")
console.log("OK: queued, data and salt saved to " + OUT)
