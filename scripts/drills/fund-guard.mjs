// scripts/drills/fund-guard.mjs — fund the V2 guard with USDC so the bounded payment scenario can run.
import fs from "fs"; import os from "os"; import path from "path"; import { ethers } from "ethers"
const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const provider = new ethers.JsonRpcProvider(RPC, 5042002)
const AMOUNT = process.argv[2] || "0.1" // USDC
const envText = fs.readFileSync(path.join(os.homedir(), ".cronus-buyer.env"), "utf8")
const pick = (s,k)=>{const m=s.match(new RegExp("^"+k+"=(.+)$","m"));if(!m)throw new Error("missing "+k);return m[1].trim()}
const norm = k => k.startsWith("0x")?k:"0x"+k
const hot = new ethers.Wallet(norm(pick(envText,"BUYER_PRIVATE_KEY")), provider)
const guardAddr = fs.readFileSync("agent-guard-v2-address.txt","utf8").trim()
const guardAbi = JSON.parse(fs.readFileSync("agent-guard-v2-abi.json","utf8"))
const guard = new ethers.Contract(guardAddr, guardAbi, hot)
const tokenAddr = await guard.token()
const erc20 = ["function approve(address,uint256) returns (bool)","function balanceOf(address) view returns (uint256)","function allowance(address,address) view returns (uint256)","function decimals() view returns (uint8)"]
const token = new ethers.Contract(tokenAddr, erc20, hot)
const dec = await token.decimals().catch(()=>6)
const amt = ethers.parseUnits(AMOUNT, dec)
console.log("token:", tokenAddr, "decimals:", dec, "amount:", AMOUNT)
console.log("hot USDC balance:", (await token.balanceOf(hot.address)).toString())
console.log("guard balance before:", (await token.balanceOf(guardAddr)).toString())
const al = await token.allowance(hot.address, guardAddr)
if (al < amt) { const a = await token.approve(guardAddr, amt); await a.wait(); console.log("approved:", a.hash) }
const f = await guard.fund(amt); await f.wait(); console.log("funded:", f.hash)
console.log("guard balance after:", (await token.balanceOf(guardAddr)).toString())
console.log("guard available():", (await guard.available()).toString())
