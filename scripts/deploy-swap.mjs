// Deploys the Cronus AMM to Arc: a fixed-supply test token, a constant-product
// pool against native Arc USDC, and the initial liquidity.
//
// Nothing here is mocked. If this script finishes, there is a pool on Arc with
// real reserves, and every swap against it is an ordinary on-chain transaction.
import { readFileSync, writeFileSync, mkdirSync } from "fs"
import solc from "solc"
import { ethers } from "ethers"

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const USDC = process.env.ARC_USDC || "0x3600000000000000000000000000000000000000"
const compileOnly = process.argv.includes("--compile-only")

// 6 decimals on both sides, matching USDC on Arc.
const UNIT = 1_000_000n
const SUPPLY = BigInt(process.env.CRN_SUPPLY || "1000000") * UNIT   // 1,000,000 CRN
const LIQ_USDC = BigInt(process.env.LIQ_USDC || "2") * UNIT         // 2 USDC
const LIQ_CRN = BigInt(process.env.LIQ_CRN || "2000") * UNIT        // 2,000 CRN -> 0.001 USDC each

const file = "CronusSwap.sol"
const content = readFileSync("contracts/" + file, "utf8")
const out = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { [file]: { content } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
})))
const errs = (out.errors || []).filter((e) => e.severity === "error")
if (errs.length) {
  console.error("COMPILE ERRORS:\n" + errs.map((e) => e.formattedMessage).join("\n"))
  process.exit(1)
}
const T = out.contracts[file].CronusToken
const S = out.contracts[file].CronusSwap
console.log("compiled OK: token", (T.evm.bytecode.object.length) / 2, "bytes, pool", (S.evm.bytecode.object.length) / 2, "bytes")

mkdirSync("abi", { recursive: true })
writeFileSync("abi/CronusToken.json", JSON.stringify(T.abi, null, 2))
writeFileSync("abi/CronusSwap.json", JSON.stringify(S.abi, null, 2))
console.log("ABIs written: abi/CronusToken.json, abi/CronusSwap.json")

if (compileOnly) { console.log("--compile-only: stopping before deploy"); process.exit(0) }

const PK = process.env.BUYER_PRIVATE_KEY
if (!PK) { console.error("Missing BUYER_PRIVATE_KEY (source ~/.cronus-buyer.env)"); process.exit(1) }
// The public Arc node rate-limits hard (-32011). staticNetwork stops ethers from
// re-asking for the chain id before every call, which is pure waste against a quota.
const provider = new ethers.JsonRpcProvider(RPC, { chainId: 5042002, name: "arc-testnet" }, { staticNetwork: true })
provider.pollingInterval = 6000

// Rate limiting is not an error worth aborting a deploy over; it is a queue.
async function withRetry(label, fn, tries = 8) {
  for (let i = 1; i <= tries; i++) {
    try { return await fn() } catch (e) {
      const msg = String(e?.error?.message || e?.shortMessage || e?.message || e)
      const transient = /request limit|-32011|rate|timeout|ECONN|fetch failed|502|503/i.test(msg)
      if (!transient || i === tries) throw e
      const wait = 4000 * i
      console.log("  [" + label + "] " + msg.slice(0, 60) + " -> retry " + i + " in " + (wait / 1000) + "s")
      await new Promise((r) => setTimeout(r, wait))
    }
  }
}
const wallet = new ethers.Wallet(PK, provider)
console.log("deployer:", wallet.address)

const erc20 = new ethers.Contract(USDC, [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
], wallet)

// Refuse early rather than half-deploying: a pool with a token but no USDC
// liquidity is worse than no pool at all.
const usdcBal = await withRetry("balance", () => erc20.balanceOf(wallet.address))
console.log("USDC on Arc:", ethers.formatUnits(usdcBal, 6))
if (usdcBal < LIQ_USDC) {
  console.error("Not enough USDC on Arc. Need " + ethers.formatUnits(LIQ_USDC, 6) + ", bridge more first.")
  process.exit(1)
}

// Resume support: an interrupted run should never orphan a deployed contract.
let tokenAddr = process.env.SWAP_TOKEN || ""
if (tokenAddr) console.log("reusing CronusToken from env:", tokenAddr)
else {
  const token = await withRetry("deploy token", () =>
    new ethers.ContractFactory(T.abi, "0x" + T.evm.bytecode.object, wallet).deploy(SUPPLY))
  console.log("token deploy tx:", token.deploymentTransaction().hash)
  await withRetry("confirm token", () => token.waitForDeployment())
  tokenAddr = await token.getAddress()
}
const tokenC = new ethers.Contract(tokenAddr, T.abi, wallet)
console.log("CronusToken (CRN):", tokenAddr)

let poolAddr = process.env.SWAP_POOL || ""
if (poolAddr) console.log("reusing CronusSwap from env:", poolAddr)
else {
  const p = await withRetry("deploy pool", () =>
    new ethers.ContractFactory(S.abi, "0x" + S.evm.bytecode.object, wallet).deploy(USDC, tokenAddr))
  console.log("pool deploy tx:", p.deploymentTransaction().hash)
  await withRetry("confirm pool", () => p.waitForDeployment())
  poolAddr = await p.getAddress()
}
console.log(">>> resume with: SWAP_TOKEN=" + tokenAddr + " SWAP_POOL=" + poolAddr)
const pool = new ethers.Contract(poolAddr, S.abi, wallet)
console.log("CronusSwap pool:", poolAddr)

if (process.env.SKIP_LIQUIDITY !== "1") {
  const a1 = await withRetry("approve usdc", () => erc20.approve(poolAddr, LIQ_USDC))
  console.log("approve usdc tx:", a1.hash); await withRetry("wait approve usdc", () => a1.wait())
  const a2 = await withRetry("approve crn", () => tokenC.approve(poolAddr, LIQ_CRN))
  console.log("approve crn tx:", a2.hash); await withRetry("wait approve crn", () => a2.wait())
  const lp = await withRetry("addLiquidity", () => pool.addLiquidity(LIQ_USDC, LIQ_CRN))
  console.log("addLiquidity tx:", lp.hash)
  await withRetry("wait liquidity", () => lp.wait())
}

const rA = await withRetry("reserveA", () => pool.reserveA())
const rB = await withRetry("reserveB", () => pool.reserveB())
console.log("reserves:", ethers.formatUnits(rA, 6), "USDC /", ethers.formatUnits(rB, 6), "CRN")
const q = await withRetry("quote", () => pool.quote(USDC, UNIT))
console.log("quote: 1 USDC ->", ethers.formatUnits(q, 6), "CRN")
console.log("\nexplorer: https://testnet.arcscan.app/address/" + poolAddr)
console.log(">>> NEXT: SWAP_POOL=" + poolAddr + "  SWAP_TOKEN=" + tokenAddr)
