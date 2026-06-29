// scripts/open-stake.mjs — open ONE real, pre-committed skin-in-the-game stake.
// Pulls a GENUINE Cronus verdict (free /api/consult), stakes a conviction-weighted USDC amount from the
// agent operating wallet into the escrow via Arc's Memo wrapper (commitment as memoId), and records an
// honest OPEN position in KV. Resolution happens later: correct -> stake returned, wrong -> stake burned.
// Requires env: BUYER_PRIVATE_KEY, STAKE_ESCROW, KV_REST_API_URL/TOKEN. RPC via RPC_URL/ARC_RPC.
import { createPublicClient, createWalletClient, http, encodeFunctionData, erc20Abi, keccak256, toBytes, stringToHex, getAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { stakeAtomicForConviction } from "../lib/stake.js"

const RPC_URL = process.env.RPC_URL || process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const PK = process.env.BUYER_PRIVATE_KEY
const BASE = process.env.CRONUS_URL || "https://cronus-capital.vercel.app"
const ESCROW = process.env.STAKE_ESCROW
const EXPECT_SIGNER = "0xB8D0054Dd4FE76115E75BF196d89E760bbCD3bc6".toLowerCase()
const MEMO_ADDRESS = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505"
const USDC_ADDRESS = process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000"
const CHAIN_ID = Number(process.env.ARC_CHAIN_ID || "5042002")
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const HORIZON_SEC = Number(process.env.STAKE_HORIZON_SECONDS || "86400")
const CANDIDATES = (process.env.STAKE_INSTRUMENTS || "BTC-USDC,ETH-USDC,SOL-USDC,BNB-USDC").split(",").map((s) => s.trim()).filter(Boolean)

function die(msg) { console.error("ABORT: " + msg); process.exit(1) }
if (!PK) die("BUYER_PRIVATE_KEY not set (try: vercel env pull)")
if (!ESCROW) die("STAKE_ESCROW not set")
if (!KV_URL || !KV_TOKEN) die("KV REST creds not set")

const memoAbi = [
  { type: "function", name: "memo", stateMutability: "nonpayable", inputs: [
    { name: "target", type: "address" }, { name: "data", type: "bytes" },
    { name: "memoId", type: "bytes32" }, { name: "memoData", type: "bytes" },
  ], outputs: [] },
]
const chain = { id: CHAIN_ID, name: "arc-testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } }
const account = privateKeyToAccount(PK.startsWith("0x") ? PK : "0x" + PK)
if (account.address.toLowerCase() !== EXPECT_SIGNER) die("signer " + account.address + " != expected agent wallet " + EXPECT_SIGNER)
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain, transport: http(RPC_URL) })

async function kv(cmd) {
  const r = await fetch(KV_URL, { method: "POST", headers: { Authorization: "Bearer " + KV_TOKEN, "content-type": "application/json" }, body: JSON.stringify(cmd) })
  const j = await r.json()
  return j && j.result
}
async function pickVerdict() {
  for (const instId of CANDIDATES) {
    try {
      const r = await fetch(BASE + "/api/consult?topic=" + encodeURIComponent(instId + " momentum") + "&instId=" + encodeURIComponent(instId))
      const j = await r.json()
      const v = String((j && j.verdict) || "SKIP").toUpperCase()
      const c = Number((j && j.conviction) || 0)
      const price = Number(j && j.price)
      console.log("consult " + instId + " -> verdict=" + v + " conviction=" + c + " price=" + price)
      if ((v === "YES" || v === "NO") && c >= 65 && price > 0) return { instId, verdict: v, conviction: c, price }
    } catch (e) { console.log("consult " + instId + " failed: " + String((e && e.message) || e)) }
  }
  return null
}
async function main() {
  const pick = await pickVerdict()
  if (!pick) { console.log("NO decisive high-conviction verdict right now (all SKIP or conviction<65). Honest abstain — no stake opened. Re-run later."); return }
  const conviction01 = Math.max(0, Math.min(1, pick.conviction / 100))
  const stakeAtomic = stakeAtomicForConviction(conviction01)
  if (stakeAtomic === "0") { console.log("conviction below stake gate after normalize — abstain"); return }
  const openedAt = Date.now()
  const resolveBy = openedAt + HORIZON_SEC * 1000
  const convictionBps = Math.round(conviction01 * 10000)
  const marketId = pick.instId + ":" + new Date(openedAt).toISOString().slice(0, 10)
  const openPrice = pick.price
  const rand = (globalThis.crypto && globalThis.crypto.getRandomValues) ? globalThis.crypto.getRandomValues(new Uint8Array(16)) : new Uint8Array(16)
  const nonce = "0x" + Array.from(rand).map((b) => b.toString(16).padStart(2, "0")).join("")
  const commitment = keccak256(toBytes("CRONUS-STAKE|" + pick.verdict + "|" + convictionBps + "|" + marketId + "|" + openPrice + "|" + resolveBy + "|" + stakeAtomic + "|" + nonce))
  const escrow = getAddress(ESCROW)
  const stakeUsdc = Number(BigInt(stakeAtomic)) / 1e6
  console.log("\n=== OPENING STAKE ===")
  console.log("market: " + marketId + " | verdict: " + pick.verdict + " | conviction: " + pick.conviction + " (" + convictionBps + " bps)")
  console.log("openPrice: " + openPrice + " | stake: " + stakeUsdc + " USDC (" + stakeAtomic + " atomic)")
  console.log("escrow: " + escrow + " | resolveBy: " + new Date(resolveBy).toISOString())
  console.log("commitment: " + commitment)
  const transferData = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [escrow, BigInt(stakeAtomic)] })
  const memoData = stringToHex("cronus|stake|" + marketId + "|" + pick.verdict + "|conv:" + pick.conviction)
  const hash = await walletClient.writeContract({ address: MEMO_ADDRESS, abi: memoAbi, functionName: "memo", args: [USDC_ADDRESS, transferData, commitment, memoData] })
  console.log("stake tx sent: https://testnet.arcscan.app/tx/" + hash)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") die("stake tx reverted: " + hash)
  console.log("stake tx confirmed in block " + Number(BigInt(receipt.blockNumber)))
  const position = {
    id: commitment.slice(0, 18), marketId, verdict: pick.verdict, conviction: conviction01, convictionBps,
    stakeAtomic, openPrice, resolveBy, status: "open", commitment, openTx: hash, openedAt,
    rule: "correct if " + pick.instId + " last price " + (pick.verdict === "YES" ? "> " : "< ") + openPrice + " at resolveBy (OKX); else wrong (stake burned)",
    escrow,
  }
  const pushed = await kv(["LPUSH", "cronus:stakes:ledger", JSON.stringify(position)])
  console.log("KV ledger LPUSH -> length=" + pushed)
  console.log("\nOPENED position " + position.id + " (status=open). Resolution later; correct->return, wrong->burn.")
}
main().catch((e) => { console.error(e); process.exit(1) })
