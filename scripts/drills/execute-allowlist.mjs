// scripts/drills/execute-allowlist.mjs — execute the matured timelock op via the multisig 2-of-3.
import fs from "fs"; import os from "os"; import path from "path"; import { ethers } from "ethers"
const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const provider = new ethers.JsonRpcProvider(RPC)
const rec = JSON.parse(fs.readFileSync("drills-op.json", "utf8"))
const { data, salt, id, target } = rec
const coldEnv = fs.readFileSync(path.join(os.homedir(), ".cronus-cold.env"), "utf8")
const pick = (s,k)=>{const m=s.match(new RegExp("^"+k+"=(.+)$","m"));if(!m)throw new Error("missing "+k);return m[1].trim()}
const norm = k => k.startsWith("0x")?k:"0x"+k
const c2 = new ethers.Wallet(norm(pick(coldEnv,"COSIGNER2_PRIVATE_KEY")), provider)
const c3 = new ethers.Wallet(norm(pick(coldEnv,"COSIGNER3_PRIVATE_KEY")), provider)
const guardAddr = fs.readFileSync("agent-guard-v2-address.txt","utf8").trim()
const msAddr = fs.readFileSync("multisig-address.txt","utf8").trim()
const guardAbi = JSON.parse(fs.readFileSync("agent-guard-v2-abi.json","utf8"))
const msAbi = JSON.parse(fs.readFileSync("multisig-abi.json","utf8"))
const guard = new ethers.Contract(guardAddr, guardAbi, provider)
const ms = new ethers.Contract(msAddr, msAbi, c2)
const msC3 = new ethers.Contract(msAddr, msAbi, c3)
const now = Math.floor(Date.now()/1000)
const eta = Number(await guard.opEta(id))
console.log("now",now,"eta",eta, eta && now>=eta ? "MATURED":"NOT READY")
if(!eta) throw new Error("opEta=0 — для этого id ничего не поставлено в очередь")
if(now<eta) throw new Error("таймлок ещё не созрел, ждать до "+new Date(eta*1000).toISOString())
if(await guard.allowed(target)){console.log("target уже в allowlist, делать нечего");process.exit(0)}
const outer = guard.interface.encodeFunctionData("execute",[data,salt])
const txId = await ms.txCount()
let tx = await ms.submit(guardAddr,0,outer); await tx.wait(); console.log("submitted multisig tx "+txId+": "+tx.hash)
tx = await msC3.confirm(txId); await tx.wait(); console.log("cosigner3 confirmed: "+tx.hash)
tx = await ms.execute(txId); await tx.wait(); console.log("executed: "+tx.hash)
console.log("allowed(target) now:", await guard.allowed(target))
