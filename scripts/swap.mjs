// One real swap against the Cronus AMM on Arc.
//
// The quote is read from the pool immediately before the trade, and minOut is set
// 1% below it. If the price moves in between, the transaction reverts instead of
// filling at whatever the pool happens to offer.
import { readFileSync } from "fs"
import { ethers } from "ethers"

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const USDC = process.env.ARC_USDC || "0x3600000000000000000000000000000000000000"
const POOL = process.env.SWAP_POOL
const TOKEN = process.env.SWAP_TOKEN
if (!POOL || !TOKEN) { console.error("Missing SWAP_POOL / SWAP_TOKEN"); process.exit(1) }

const UNIT = 1_000_000n
const AMOUNT = BigInt(Math.round(Number(process.env.AMOUNT || "0.1") * 1e6))
const SELL_CRN = process.env.SELL_CRN === "1"
const SLIPPAGE_BPS = BigInt(process.env.SLIPPAGE_BPS || "100") // 1%

const PK = process.env.BUYER_PRIVATE_KEY
if (!PK) { console.error("Missing BUYER_PRIVATE_KEY"); process.exit(1) }
const provider = new ethers.JsonRpcProvider(RPC, { chainId: 5042002, name: "arc-testnet" }, { staticNetwork: true })
const wallet = new ethers.Wallet(PK, provider)

async function withRetry(label, fn, tries = 8) {
  for (let i = 1; i <= tries; i++) {
    try { return await fn() } catch (e) {
      const msg = String(e?.error?.message || e?.shortMessage || e?.message || e)
      if (!/request limit|-32011|rate|timeout|ECONN|fetch failed|502|503/i.test(msg) || i === tries) throw e
      const wait = 4000 * i
      console.log("  [" + label + "] rate limited -> retry " + i + " in " + (wait / 1000) + "s")
      await new Promise((r) => setTimeout(r, wait))
    }
  }
}

const poolAbi = JSON.parse(readFileSync("abi/CronusSwap.json", "utf8"))
const pool = new ethers.Contract(POOL, poolAbi, wallet)
const erc20Abi = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]
const tokenIn = SELL_CRN ? TOKEN : USDC
const inName = SELL_CRN ? "CRN" : "USDC"
const outName = SELL_CRN ? "USDC" : "CRN"
const inC = new ethers.Contract(tokenIn, erc20Abi, wallet)

console.log("trader:", wallet.address)
const bal = await withRetry("balance", () => inC.balanceOf(wallet.address))
console.log("balance:", ethers.formatUnits(bal, 6), inName)
if (bal < AMOUNT) { console.error("Not enough " + inName); process.exit(1) }

const quote = await withRetry("quote", () => pool.quote(tokenIn, AMOUNT))
const minOut = (quote * (10000n - SLIPPAGE_BPS)) / 10000n
console.log("quote:", ethers.formatUnits(AMOUNT, 6), inName, "->", ethers.formatUnits(quote, 6), outName)
console.log("minOut (1% tolerance):", ethers.formatUnits(minOut, 6), outName)

const ap = await withRetry("approve", () => inC.approve(POOL, AMOUNT))
console.log("approve tx:", ap.hash)
await withRetry("wait approve", () => ap.wait())

const tx = await withRetry("swap", () => pool.swapExactIn(tokenIn, AMOUNT, minOut, wallet.address))
console.log("SWAP TX:", tx.hash)
const rc = await withRetry("wait swap", () => tx.wait())
console.log("mined in block", rc.blockNumber, "| status", rc.status === 1 ? "success" : "FAILED")

const rA = await withRetry("reserveA", () => pool.reserveA())
const rB = await withRetry("reserveB", () => pool.reserveB())
console.log("reserves after:", ethers.formatUnits(rA, 6), "USDC /", ethers.formatUnits(rB, 6), "CRN")
console.log("\nexplorer: https://testnet.arcscan.app/tx/" + tx.hash)
