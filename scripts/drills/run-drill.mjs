// scripts/drills/run-drill.mjs — exercise the containment against the live guard.
// Three rogue scenarios that must revert, one bounded payment that must succeed.
// Safety rule: an attack transaction is only broadcast after a static call proves it
// reverts. If a rogue path would actually succeed, the drill refuses to send it and
// records a red result, because a fire drill must never become the fire.
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { JsonRpcProvider, Wallet, Interface, Contract } from "ethers"

const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const CHAIN = 5042002
const GUARD = "0xeA4788164c63B0EF2788d9c74859B43f42BC391E"
const CONTROL_AMOUNT = 10000n
const GAS_LIMIT = 250000n
const SIMULATE = process.argv.includes("--simulate")

const CANDIDATES = [
  "0xdc6778C5F8cC74b10aED11c48306D4Cfc5737FBD",
  "0x99d0Da7e02c605e9Efe6b06226433770DBafEEac",
  "0xB8D0054Dd4FE76115E75BF196d89E760bbCD3bc6",
]

const GUARD_ABI = [
  "function operator() view returns (address)",
  "function paused() view returns (bool)",
  "function perTxCap() view returns (uint256)",
  "function available() view returns (uint256)",
  "function token() view returns (address)",
  "function allowed(address) view returns (bool)",
  "function spend(address,uint256) returns (bool)",
  "function unpause()",
]
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"]
const GI = new Interface(GUARD_ABI)

function pickKey(text, name) {
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (line === "" || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq < 0) continue
    if (line.slice(0, eq).trim() !== name) continue
    let v = line.slice(eq + 1).trim()
    if (v.startsWith("\"")) v = v.slice(1, -1)
    if (v.startsWith("'")) v = v.slice(1, -1)
    return v.startsWith("0x") ? v : "0x" + v
  }
  const names = text.split("\n").map((l) => l.split("=")[0].trim()).filter((x) => x !== "" && !x.startsWith("#"))
  throw new Error("key " + name + " not found; the file defines: " + names.join(", "))
}

function reasonOf(e) {
  const cands = [e && e.reason, e && e.shortMessage, e && e.info && e.info.error && e.info.error.message, e && e.message]
  for (const c of cands) {
    if (typeof c === "string" && c.trim() !== "") return c.slice(0, 200)
  }
  return "unknown"
}

const provider = new JsonRpcProvider(RPC, CHAIN)
const envText = fs.readFileSync(path.join(os.homedir(), ".cronus-buyer.env"), "utf8")
const hot = new Wallet(pickKey(envText, "BUYER_PRIVATE_KEY"), provider)
const guard = new Contract(GUARD, GUARD_ABI, provider)

const startedAt = new Date().toISOString()
const runId = startedAt.replace(/[:.]/g, "-")
const scenarios = []

const operator = await guard.operator()
const paused = await guard.paused()
const perTxCap = await guard.perTxCap()
const available = await guard.available()
const tokenAddr = await guard.token()
const token = new Contract(tokenAddr, ERC20_ABI, provider)
const guardBalance = await token.balanceOf(GUARD)
const gas = await provider.getBalance(hot.address)

console.log("hot key:", hot.address)
console.log("operator on chain:", operator, "match:", operator.toLowerCase() === hot.address.toLowerCase())
console.log("paused:", paused, "perTxCap:", perTxCap.toString(), "available:", available.toString())
console.log("guard USDC balance:", guardBalance.toString(), "hot gas:", gas.toString())

if (operator.toLowerCase() !== hot.address.toLowerCase()) throw new Error("this key is not the operator; refusing to run")
if (paused) throw new Error("guard is paused; a drill now would prove nothing about the caps")
if (gas === 0n) throw new Error("hot key has no gas")

let recipient = null
for (const c of CANDIDATES) {
  const ok = await guard.allowed(c)
  console.log("allowed(" + c + "):", ok)
  if (ok && recipient === null) recipient = c
}

async function staticReverts(data) {
  try {
    await provider.call({ to: GUARD, data, from: hot.address })
    return { reverts: false, reason: null }
  } catch (e) {
    return { reverts: true, reason: reasonOf(e) }
  }
}

async function rogue(id, why, data) {
  const probe = await staticReverts(data)
  if (!probe.reverts) {
    console.log("REFUSING to send " + id + ": the static call succeeded, so this is not a drill, it is a live attack path")
    scenarios.push({ id, expect: "revert", outcome: "aborted_would_succeed", reason: "static call did not revert; transaction deliberately not broadcast", why })
    return
  }
  if (SIMULATE) {
    scenarios.push({ id, expect: "revert", outcome: "simulated_revert", reason: probe.reason, why })
    console.log(id + ": simulated revert -", probe.reason)
    return
  }
  const tx = await hot.sendTransaction({ to: GUARD, data, gasLimit: GAS_LIMIT })
  console.log(id + " sent " + tx.hash)
  const rec = await provider.waitForTransaction(tx.hash)
  const outcome = rec.status === 0 ? "reverted" : "unexpected_success"
  scenarios.push({ id, expect: "revert", outcome, reason: probe.reason, txHash: tx.hash, block: rec.blockNumber, gasUsed: String(rec.gasUsed), why })
  console.log(id + " status " + rec.status + " block " + rec.blockNumber)
}

const freshVictim = Wallet.createRandom().address
await rogue("drain_to_new_address", "a fully compromised key must not reach an address nobody approved", GI.encodeFunctionData("spend", [freshVictim, available > 0n ? available : 1000000n]))

if (recipient === null) {
  scenarios.push({ id: "over_per_tx_cap", expect: "revert", outcome: "skipped", reason: "no allowlisted recipient found among the candidates, so a cap test would revert for the wrong reason", why: "a single payment must not exceed the per-tx cap" })
} else {
  await rogue("over_per_tx_cap", "a single payment must not exceed the per-tx cap", GI.encodeFunctionData("spend", [recipient, perTxCap + 1n]))
}

await rogue("operator_escalation", "the spending key must not be able to change the rules or unpause", GI.encodeFunctionData("unpause", []))

const controlWhy = "a bounded rail must still pay, otherwise the test proves nothing but a dead contract"
if (recipient === null || guardBalance < CONTROL_AMOUNT || available < CONTROL_AMOUNT) {
  scenarios.push({ id: "bounded_allowlisted_payment", expect: "success", outcome: "skipped", reason: recipient === null ? "no allowlisted recipient" : "guard balance or remaining daily room below the control amount", why: controlWhy })
} else if (SIMULATE) {
  const probe = await staticReverts(GI.encodeFunctionData("spend", [recipient, CONTROL_AMOUNT]))
  scenarios.push({ id: "bounded_allowlisted_payment", expect: "success", outcome: probe.reverts ? "simulated_revert" : "simulated_success", reason: probe.reason, why: controlWhy })
} else {
  const data = GI.encodeFunctionData("spend", [recipient, CONTROL_AMOUNT])
  const probe = await staticReverts(data)
  if (probe.reverts) {
    scenarios.push({ id: "bounded_allowlisted_payment", expect: "success", outcome: "reverted", reason: probe.reason, why: controlWhy })
  } else {
    const tx = await hot.sendTransaction({ to: GUARD, data, gasLimit: GAS_LIMIT })
    console.log("control payment sent " + tx.hash)
    const rec = await provider.waitForTransaction(tx.hash)
    scenarios.push({ id: "bounded_allowlisted_payment", expect: "success", outcome: rec.status === 1 ? "succeeded" : "unexpected_revert", txHash: tx.hash, block: rec.blockNumber, gasUsed: String(rec.gasUsed), recipient, amountUsdc: Number(CONTROL_AMOUNT) / 1e6, why: controlWhy })
    console.log("control status " + rec.status + " block " + rec.blockNumber)
  }
}

const run = {
  runId,
  startedAt,
  finishedAt: new Date().toISOString(),
  mode: SIMULATE ? "simulated" : "live",
  guard: GUARD,
  operator: hot.address,
  perTxCapUsdc: Number(perTxCap) / 1e6,
  availableUsdcAtStart: Number(available) / 1e6,
  allowlistedRecipientUsed: recipient,
  scenarios,
  note: "Rogue scenarios are broadcast only after a static call proved they revert, so a reverted transaction here is evidence of containment rather than a failed attempt at theft.",
}

if (!SIMULATE) {
  fs.writeFileSync(path.join("drills", runId + ".json"), JSON.stringify(run, null, 2) + "\n")
  const files = fs.readdirSync("drills").filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 20)
  const all = files.map((f) => JSON.parse(fs.readFileSync(path.join("drills", f), "utf8")))
  const header = "// lib/drillsData.js - recorded fire-drill runs, newest first.\n// Generated by scripts/drills/run-drill.mjs. Committed on purpose: a drill history in\n// the repository is verifiable by anyone, a private cache is verifiable only by us.\n"
  fs.writeFileSync("lib/drillsData.js", header + "export const RUNS = " + JSON.stringify(all, null, 2) + "\n\nexport default RUNS\n")
  console.log("wrote drills/" + runId + ".json and regenerated lib/drillsData.js (" + all.length + " runs)")
}

console.log(JSON.stringify(run, null, 2))
