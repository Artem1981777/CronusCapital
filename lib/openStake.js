// lib/openStake.js — server-side skin-in-the-game opener (POST, auth via CRON_SECRET).
// Signs with TREASURY_PRIVATE_KEY (agent treasury) — secrets never leave Vercel.
// Flow: real verdict (/api/consult) -> conviction-weighted stake -> Memo-wrapped USDC.transfer
// (treasury -> escrow) with on-chain keccak256 commitment (incl. openPrice) -> record OPEN position in KV.
// Routed as POST /api/open-stake via vercel.json -> /api/info?kind=open-stake. NOT in public discovery.
import { createWalletClient, createPublicClient, http, defineChain, encodeFunctionData, erc20Abi, keccak256, toBytes, stringToHex, getAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { randomBytes } from "node:crypto"
import { stakeAtomicForConviction } from "./stake.js"

const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID || "5042002")
const ARC_RPC = process.env.ARC_RPC || process.env.SIGNAL_RPC_URL || process.env.VITE_RPC_URL || "https://rpc.testnet.arc.network"
const USDC_ADDRESS = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000")
const MEMO_ADDRESS = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505"
const EXPLORER = process.env.ARC_EXPLORER || "https://testnet.arcscan.app"
const HORIZON_SEC = Number(process.env.STAKE_HORIZON_SECONDS || "86400")
const DEFAULT_INSTRUMENTS = (process.env.STAKE_INSTRUMENTS || "BTC-USDC,ETH-USDC,SOL-USDC,BNB-USDC").split(",").map((s) => s.trim()).filter(Boolean)
const arcChain = defineChain({ id: ARC_CHAIN_ID, name: "arc-testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [ARC_RPC] } } })
const memoAbi = [{ type: "function", name: "memo", stateMutability: "nonpayable", inputs: [{ name: "target", type: "address" }, { name: "data", type: "bytes" }, { name: "memoId", type: "bytes32" }, { name: "memoData", type: "bytes" }], outputs: [] }]

function normPk(pk) { if (!pk) return null; return pk.startsWith("0x") ? pk : "0x" + pk }
async function kvCmd(cmd) {
  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return null
  try {
    const r = await fetch(base, { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(cmd) })
    const j = await r.json()
    return j && j.result
  } catch (_) { return null }
}
async function pickVerdict(host, instruments) {
  const proto = host.indexOf("localhost") === 0 ? "http" : "https"
  const tried = []
  for (const instId of instruments) {
    try {
      const r = await fetch(proto + "://" + host + "/api/consult?topic=" + encodeURIComponent(instId + " momentum") + "&instId=" + encodeURIComponent(instId))
      const j = await r.json()
      const v = String((j && j.verdict) || "SKIP").toUpperCase()
      const c = Number((j && j.conviction) || 0)
      const price = Number(j && j.price)
      tried.push({ instId, verdict: v, conviction: c, price })
      if ((v === "YES" || v === "NO") && c >= 65 && price > 0) return { pick: { instId, verdict: v, conviction: c, price }, tried }
    } catch (e) { tried.push({ instId, error: String((e && e.message) || e) }) }
  }
  return { pick: null, tried }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST only" }); return }
  const secret = process.env.CRON_SECRET || ""
  const auth = (req.headers && req.headers.authorization) || ""
  if (!secret || auth !== "Bearer " + secret) { res.status(401).json({ ok: false, error: "unauthorized" }); return }
  const pk = normPk(process.env.TREASURY_PRIVATE_KEY)
  if (!pk) { res.status(500).json({ ok: false, error: "TREASURY_PRIVATE_KEY not set" }); return }
  const escrowRaw = process.env.STAKE_ESCROW
  if (!escrowRaw) { res.status(500).json({ ok: false, error: "STAKE_ESCROW not set" }); return }
  const lock = await kvCmd(["SET", "cronus:stakes:lock", "1", "NX", "EX", "120"])
  if (lock !== "OK") { res.status(409).json({ ok: false, error: "another open in progress (lock held)" }); return }
  try {
    const host = (req.headers && req.headers.host) || "localhost"
    const body = req.body && typeof req.body === "object" ? req.body : {}
    let instruments = DEFAULT_INSTRUMENTS
    if (body.instId) instruments = [String(body.instId)]
    else if (Array.isArray(body.instruments)) instruments = body.instruments.map(String)
    const { pick, tried } = await pickVerdict(host, instruments)
    if (!pick) { res.status(200).json({ ok: true, opened: false, reason: "no decisive high-conviction verdict (all SKIP or conviction<65) — honest abstain", scanned: tried }); return }
    const conviction01 = Math.max(0, Math.min(1, pick.conviction / 100))
    const stakeAtomic = stakeAtomicForConviction(conviction01)
    if (stakeAtomic === "0") { res.status(200).json({ ok: true, opened: false, reason: "below stake gate after normalize — abstain", scanned: tried }); return }
    const openedAt = Date.now()
    const resolveBy = openedAt + HORIZON_SEC * 1000
    const convictionBps = Math.round(conviction01 * 10000)
    const marketId = pick.instId + ":" + new Date(openedAt).toISOString().slice(0, 10)
    const openPrice = pick.price
    const nonce = "0x" + randomBytes(16).toString("hex")
    const commitment = keccak256(toBytes("CRONUS-STAKE|" + pick.verdict + "|" + convictionBps + "|" + marketId + "|" + openPrice + "|" + resolveBy + "|" + stakeAtomic + "|" + nonce))
    const escrow = getAddress(escrowRaw)
    const account = privateKeyToAccount(pk)
    const publicClient = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })
    const walletClient = createWalletClient({ account, chain: arcChain, transport: http(ARC_RPC) })
    const usdcBal = await publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [account.address] })
    if (usdcBal < BigInt(stakeAtomic)) { res.status(400).json({ ok: false, error: "treasury USDC too low", needAtomic: stakeAtomic, haveAtomic: String(usdcBal), signer: account.address }); return }
    const transferData = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [escrow, BigInt(stakeAtomic)] })
    const memoData = stringToHex("cronus|stake|" + marketId + "|" + pick.verdict + "|conv:" + pick.conviction)
    const hash = await walletClient.writeContract({ address: MEMO_ADDRESS, abi: memoAbi, functionName: "memo", args: [USDC_ADDRESS, transferData, commitment, memoData] })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== "success") { res.status(502).json({ ok: false, error: "stake tx reverted", openTx: hash, explorer: EXPLORER + "/tx/" + hash }); return }
    const position = {
      id: commitment.slice(0, 18), marketId, verdict: pick.verdict, conviction: conviction01, convictionBps,
      stakeAtomic, openPrice, resolveBy, status: "open", commitment, openTx: hash, openedAt,
      rule: "correct if " + pick.instId + " last price " + (pick.verdict === "YES" ? "> " : "< ") + openPrice + " at resolveBy (OKX); else wrong (stake burned)",
      escrow: escrow.toLowerCase(), signer: account.address,
    }
    const len = await kvCmd(["LPUSH", "cronus:stakes:ledger", JSON.stringify(position)])
    res.status(200).json({ ok: true, opened: true, position, ledgerLength: len, explorer: EXPLORER + "/tx/" + hash })
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e && e.message) || e) })
  } finally {
    await kvCmd(["DEL", "cronus:stakes:lock"])
  }
}
