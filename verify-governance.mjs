import fs from "fs"
import os from "os"
import path from "path"
import { ethers } from "ethers"

const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const provider = new ethers.JsonRpcProvider(RPC)

const guardAddr = fs.readFileSync("agent-guard-v2-address.txt", "utf8").trim()
const msAddr = fs.readFileSync("multisig-address.txt", "utf8").trim()
const guardAbi = JSON.parse(fs.readFileSync("agent-guard-v2-abi.json", "utf8"))
const msAbi = JSON.parse(fs.readFileSync("multisig-abi.json", "utf8"))

const COLD = path.join(os.homedir(), ".cronus-cold.env")
const env = fs.readFileSync(COLD, "utf8")
const pick = (k) => { const m = env.match(new RegExp("^" + k + "=(.+)$", "m")); return m ? m[1].trim() : null }
const RECOVERY = pick("RECOVERY_ADDRESS")
const C2 = pick("COSIGNER2_ADDRESS")
const C3 = pick("COSIGNER3_ADDRESS")
const DEPLOYER = "0xB8D0054Dd4FE76115E75BF196d89E760bbCD3bc6"

const guard = new ethers.Contract(guardAddr, guardAbi, provider)
const ms = new ethers.Contract(msAddr, msAbi, provider)

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const ok = String(got).toLowerCase() === String(want).toLowerCase()
  console.log((ok ? "PASS " : "FAIL ") + name + " = " + got + (ok ? "" : "  (expected " + want + ")"))
  ok ? pass++ : fail++
}

console.log("Guard:", guardAddr)
console.log("Multisig:", msAddr)
console.log("--- Guard wiring ---")
eq("guard.owner == multisig", await guard.owner(), msAddr)
eq("guard.recovery == cold", await guard.recovery(), RECOVERY)
eq("guard.operator == deployer(hot)", await guard.operator(), DEPLOYER)
eq("guard.guardian == deployer(hot)", await guard.guardian(), DEPLOYER)
console.log("--- Guard immutable caps ---")
eq("guard.MAX_PER_TX_CAP", (await guard.MAX_PER_TX_CAP()).toString(), "50000000")
eq("guard.MAX_DAILY_CAP", (await guard.MAX_DAILY_CAP()).toString(), "500000000")
eq("guard.perTxCap", (await guard.perTxCap()).toString(), "25000000")
eq("guard.dailyCap", (await guard.dailyCap()).toString(), "100000000")
eq("guard.timelockDelay", (await guard.timelockDelay()).toString(), "172800")
console.log("--- Multisig wiring ---")
eq("ms.threshold", (await ms.threshold()).toString(), "2")
eq("ms.ownersCount", (await ms.ownersCount()).toString(), "3")
eq("ms.isOwner(deployer)", await ms.isOwner(DEPLOYER), "true")
eq("ms.isOwner(cosigner2)", await ms.isOwner(C2), "true")
eq("ms.isOwner(cosigner3)", await ms.isOwner(C3), "true")

console.log("\n" + pass + " passed, " + fail + " failed")
process.exit(fail === 0 ? 0 : 1)
