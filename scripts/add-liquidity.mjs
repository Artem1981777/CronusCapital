// Deepen the Cronus pool without moving its price.
//
// The CRN side is derived from the live reserve ratio rather than passed in, because any
// mismatch would hand a free arbitrage to whoever notices first. Price stays put; only
// depth changes, so the same trade costs less slippage afterwards.
import { readFileSync } from "fs"
import { ethers } from "ethers"

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const USDC = process.env.ARC_USDC || "0x3600000000000000000000000000000000000000"
const POOL = process.env.SWAP_POOL
const TOKEN = process.env.SWAP_TOKEN
const ADD_USDC = BigInt(Math.round(Number(process.env.ADD_USDC || "7.9") * 1e6))
const RESERVE_GAS = BigInt(Math.round(Number(process.env.RESERVE_GAS || "3") * 1e6))
if (!POOL || !TOKEN) { console.error("Missing SWAP_POOL / SWAP_TOKEN"); process.exit(1) }
const PK = process.env.BUYER_PRIVATE_KEY
if (!PK) { console.error("Missing BUYER_PRIVATE_KEY"); process.exit(1) }

const provider = new ethers.JsonRpcProvider(RPC, { chainId: 5042002, name: "arc-testnet" }, { staticNetwork: true })
const wallet = new ethers.Wallet(PK, provider)

async function withRetry(label, fn, tries = 8) {
  for (let i = 1; i <= tries; i++) {
    try { return await fn() } catch (e) {
      const m = String(e?.code || "") + " " + String(e?.error?.message || e?.shortMessage || e?.message || e)
      if (!/request limit|-32011|rate|timeout|ECONN|fetch failed|502|503/i.test(m) || i === tries) throw e
      console.log("  [" + label + "] rate limited -> retry " + i)
      await new Promise((r) => setTimeout(r, 4000 * i))
    }
  }
}

const f = (v) => ethers.formatUnits(v, 6)
const poolAbi = JSON.parse(readFileSync("abi/CronusSwap.json", "utf8"))
const pool = new ethers.Contract(POOL, poolAbi, wallet)
const erc20 = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]
const usdc = new ethers.Contract(USDC, erc20, wallet)
const crn = new ethers.Contract(TOKEN, erc20, wallet)

const rA = await withRetry("reserveA", () => pool.reserveA())
const rB = await withRetry("reserveB", () => pool.reserveB())
console.log("reserves now:", f(rA), "USDC /", f(rB), "CRN")

const addCrn = (ADD_USDC * rB) / rA
console.log("adding:", f(ADD_USDC), "USDC /", f(addCrn), "CRN (ratio preserved)")

// On Arc the gas token IS USDC, so spending the pool side down to zero would strand the wallet.
const balU = await withRetry("bal usdc", () => usdc.balanceOf(wallet.address))
const balC = await withRetry("bal crn", () => crn.balanceOf(wallet.address))
if (balU < ADD_USDC + RESERVE_GAS) {
  console.error("Refusing: " + f(balU) + " USDC held, need " + f(ADD_USDC) + " plus " + f(RESERVE_GAS) + " kept for gas")
  process.exit(1)
}
if (balC < addCrn) { console.error("Refusing: not enough CRN (" + f(balC) + ")"); process.exit(1) }

const a1 = await withRetry("approve usdc", () => usdc.approve(POOL, ADD_USDC))
console.log("approve usdc tx:", a1.hash); await withRetry("wait a1", () => a1.wait())
const a2 = await withRetry("approve crn", () => crn.approve(POOL, addCrn))
console.log("approve crn tx:", a2.hash); await withRetry("wait a2", () => a2.wait())

const lp = await withRetry("addLiquidity", () => pool.addLiquidity(ADD_USDC, addCrn))
console.log("ADD LIQUIDITY TX:", lp.hash)
const rc = await withRetry("wait lp", () => lp.wait())
console.log("mined in block", rc.blockNumber, "| status", rc.status === 1 ? "success" : "FAILED")

const nA = await withRetry("reserveA2", () => pool.reserveA())
const nB = await withRetry("reserveB2", () => pool.reserveB())
console.log("reserves after:", f(nA), "USDC /", f(nB), "CRN")
const q = await withRetry("quote", () => pool.quote(USDC, 1_000_000n))
console.log("quote: 1 USDC ->", f(q), "CRN")
console.log("\nexplorer: https://testnet.arcscan.app/tx/" + lp.hash)
