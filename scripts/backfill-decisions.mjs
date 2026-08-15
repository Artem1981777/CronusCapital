import { readFileSync } from "fs"
import { ethers } from "ethers"

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const BASE = process.env.CRONUS_URL || "https://cronus-capital.vercel.app"
const dep = JSON.parse(readFileSync("deployments/CronusDecisions.arc-testnet.json", "utf8"))
const ADDR = process.env.CRONUS_DECISIONS_ADDRESS || dep.address
const abi = JSON.parse(readFileSync("abi/CronusDecisions.json", "utf8"))
const broadcast = process.argv.includes("--broadcast")
const force = process.argv.includes("--force")
const AGENT_ID = 3

function shortHash(h) { const x = String(h || "").split(":")[1] || String(h || ""); return x.slice(0, 12) }

async function getRecords() {
  const L = await (await fetch(BASE + "/api/trace")).json()
  const hashes = Array.isArray(L.recent) ? L.recent : []
  const out = []
  for (const h of hashes) {
    try {
      const F = await (await fetch(BASE + "/api/trace?hash=" + encodeURIComponent(h))).json()
      const rec = F && F.record, inp = rec && rec.input, outp = rec && rec.output
      const topic = inp && inp.topic
      if (!topic || !outp) continue
      const verdict = String(outp.verdict || outp.decision || "SKIP")
      const conviction = Math.max(0, Math.min(100, Math.round(Number(outp.conviction || 0))))
      out.push({ topic: String(topic), decision: verdict + " #" + shortHash(F.hash || h), agentId: AGENT_ID, confidence: conviction })
    } catch (e) {}
  }
  return out
}

const provider = new ethers.JsonRpcProvider(RPC)
const records = (await getRecords()).reverse()
console.log("fetched decisions:", records.length)
if (!records.length) { console.error("no records to backfill"); process.exit(1) }
console.log("sample[0]:", JSON.stringify(records[0]))

const PK = process.env.BUYER_PRIVATE_KEY
if (!PK) { console.error("Missing BUYER_PRIVATE_KEY (run: set -a && source ~/.cronus-buyer.env && set +a)"); process.exit(1) }
const wallet = new ethers.Wallet(PK, provider)
const c = new ethers.Contract(ADDR, abi, wallet)

const already = Number(await c.getDecisionsCount())
console.log("on-chain decisions already:", already, "at", ADDR)

const r0 = records[0]
const gas1 = await c.logDecision.estimateGas(r0.topic, r0.decision, r0.agentId, r0.confidence)
const fee = await provider.getFeeData()
const gasPrice = fee.gasPrice || fee.maxFeePerGas || 0n
const perTx = gas1 * gasPrice
const total = perTx * BigInt(records.length)
console.log("est gas/tx:", gas1.toString(), " gasPrice(wei):", gasPrice.toString())
console.log("est cost/tx:", ethers.formatEther(perTx), "USDC-gas")
console.log("est TOTAL for " + records.length + " tx:", ethers.formatEther(total), "USDC-gas")
const bal = await provider.getBalance(wallet.address)
console.log("deployer balance:", ethers.formatEther(bal), "USDC-gas")

if (!broadcast) { console.log("\nDRY-RUN. Re-run with --broadcast to send " + records.length + " tx."); process.exit(0) }
if (already > 0 && !force) { console.log("\nWARNING: contract already has " + already + " decisions; re-run would DUPLICATE. Add --force to override."); process.exit(1) }

console.log("\nBROADCASTING " + records.length + " logDecision tx...")
let nonce = await provider.getTransactionCount(wallet.address)
let sent = 0
for (const r of records) {
  try {
    const tx = await c.logDecision(r.topic, r.decision, r.agentId, r.confidence, { nonce: nonce++ })
    sent++
    console.log(sent + "/" + records.length + " " + tx.hash + "  " + r.topic + " -> " + r.decision + " (" + r.confidence + ")")
    await tx.wait()
  } catch (e) { console.log("FAIL at " + (sent + 1) + ": " + String(e.message || e).slice(0, 140)); break }
}
console.log("done. sent:", sent)
console.log("on-chain decisions now:", Number(await c.getDecisionsCount()))
