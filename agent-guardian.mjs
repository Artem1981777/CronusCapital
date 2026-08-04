import fs from "fs"
import { ethers } from "ethers"

const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const SCAN = "https://testnet.arcscan.app/tx/"
const PK = process.env.GUARDIAN_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY
if (!PK) { console.error("Set GUARDIAN_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY)"); process.exit(1) }

const GUARD = fs.readFileSync("agent-guard-address.txt", "utf8").trim()
const abi = JSON.parse(fs.readFileSync("agent-guard-abi.json", "utf8"))

// Early-warning thresholds (deliberately BELOW the on-chain daily cap)
const WINDOW_SEC = Number(process.env.WINDOW_SEC || 60)
const MAX_SPENDS = Number(process.env.MAX_SPENDS || 3)   // trip if > this many spends in the window
const MAX_USDC   = Number(process.env.MAX_USDC || 50)    // trip if > this much USDC in the window
const POLL_SEC   = Number(process.env.POLL_SEC || 5)
const DRY_RUN    = process.env.DRY_RUN === "1"

const key = PK.startsWith("0x") ? PK : "0x" + PK
const provider = new ethers.JsonRpcProvider(RPC)
const wallet = new ethers.Wallet(key, provider)
const guard = new ethers.Contract(GUARD, abi, wallet)

let recent = [] // { t, amount, to, tx }
let last = await provider.getBlockNumber()

console.log("Cerberus guardian watching:", GUARD)
console.log("Guardian key:", wallet.address)
console.log(`Rules: > ${MAX_SPENDS} spends OR > ${MAX_USDC} USDC per ${WINDOW_SEC}s -> pause()${DRY_RUN ? "  [DRY_RUN]" : ""}`)

async function tick() {
  try {
    const latest = await provider.getBlockNumber()
    if (latest >= last + 1) {
      const evs = await guard.queryFilter(guard.filters.Spent(), last + 1, latest)
      for (const e of evs) {
        const amt = Number(ethers.formatUnits(e.args.amount, 6))
        recent.push({ t: Date.now(), amount: amt, to: e.args.to, tx: e.transactionHash })
        console.log(`Spent ${amt} USDC -> ${e.args.to}  ${e.transactionHash}`)
      }
      last = latest
    }
    const cutoff = Date.now() - WINDOW_SEC * 1000
    recent = recent.filter(r => r.t >= cutoff)
    const count = recent.length
    const sum = recent.reduce((a, r) => a + r.amount, 0)

    if (count > MAX_SPENDS || sum > MAX_USDC) {
      const paused = await guard.paused()
      if (paused) { console.log("Anomaly persists, but already paused."); return }
      console.log(`!!! ANOMALY: ${count} spends / ${sum} USDC in ${WINDOW_SEC}s -> PAUSING`)
      if (DRY_RUN) { console.log("[DRY_RUN] would call pause() now"); return }
      const tx = await guard.pause()
      console.log("pause() tx:", tx.hash, SCAN + tx.hash)
      await tx.wait()
      console.log("PAUSED. Operator spends now revert. Owner must investigate and unpause().")
    }
  } catch (err) {
    console.log("tick error:", err.shortMessage || err.message)
  }
}

await tick()
setInterval(tick, POLL_SEC * 1000)
console.log("Watching... (Ctrl+C to stop)")
