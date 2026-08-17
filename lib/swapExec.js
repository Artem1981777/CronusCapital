// lib/swapExec.js — LIVE token swap on Arc via CronusSwap AMM (USDC<->CRN), signed by the Cronus treasury.
// Routed via /api/info?kind=swap (no new serverless function). DRY-RUN BY DEFAULT: real swap needs execute:true + execKey.
// Honesty: executed pair is USDC/CRN in Cronus's own on-chain AMM. No real BTC exists on Arc testnet;
// instId/topic only drive the signal via /api/consult. Guards: execKey gate + per-swap cap + daily cap + rate-lock + slippage.
import { createWalletClient, createPublicClient, http, defineChain } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { emergencyPaused, pauseError } from "./guard.js"

const ARC_USDC = (process.env.ARC_USDC || "0x3600000000000000000000000000000000000000").toLowerCase()
const ARC_RPC = "https://rpc.testnet.arc.network"
const ARCSCAN = "https://testnet.arcscan.app/tx/"
const ARC_CHAIN_ID = 5042002
const SWAP_POOL = (process.env.SWAP_POOL || "").toLowerCase()
const SWAP_TOKEN = (process.env.SWAP_TOKEN || "").toLowerCase()
const PER_SWAP_CAP_ATOMIC = BigInt(process.env.SWAP_PER_CAP_ATOMIC || "2000000")
const DAILY_CAP_ATOMIC = Number(process.env.SWAP_DAILY_CAP_ATOMIC || "50000000")
const DEFAULT_SLIPPAGE_BPS = Number(process.env.SWAP_SLIPPAGE_BPS || "100")
const MIN_CONVICTION = Number(process.env.SWAP_MIN_CONVICTION || "65")
const RATE_KEY = "cronus:swap:last"
const DAILY_KEY = "cronus:swap:daily"
const MAX_UINT = (2n ** 256n) - 1n
const KV_URL = process.env.KV_REST_API_URL || ""
const KV_TOKEN = process.env.KV_REST_API_TOKEN || ""

const arcChain = defineChain({ id: ARC_CHAIN_ID, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [ARC_RPC] } } })

const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
]
const POOL_ABI = [
  { type: "function", name: "quote", stateMutability: "view", inputs: [{ name: "tokenIn", type: "address" }, { name: "amountIn", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "swapExactIn", stateMutability: "nonpayable", inputs: [{ name: "tokenIn", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "minOut", type: "uint256" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "out", type: "uint256" }] },
]

function normPk(pk) { const t = (pk || "").trim(); if (!t) return ""; return t.indexOf("0x") === 0 ? t : "0x" + t }
function safeJson(v) { if (!v) return {}; if (typeof v === "object") return v; try { return JSON.parse(v) } catch { return {} } }
async function kvCmd(path) { if (!KV_URL || !KV_TOKEN) return null; try { const r = await fetch(KV_URL + path, { headers: { Authorization: "Bearer " + KV_TOKEN } }); if (!r.ok) return null; const j = await r.json(); return j.result } catch { return null } }
async function kvLock(key, sec) { return await kvCmd("/set/" + encodeURIComponent(key) + "/1?NX=true&EX=" + sec) }
async function kvDel(key) { return await kvCmd("/del/" + encodeURIComponent(key)) }
async function kvGet(key) { return await kvCmd("/get/" + encodeURIComponent(key)) }
async function kvSet(key, val) { return await kvCmd("/set/" + encodeURIComponent(key) + "/" + encodeURIComponent(val)) }
async function kvIncrByFloat(key, n) { return await kvCmd("/incrbyfloat/" + encodeURIComponent(key) + "/" + encodeURIComponent(String(n))) }
function signerAddress() { const pk = normPk(process.env.TREASURY_PRIVATE_KEY); if (!pk) return null; try { return privateKeyToAccount(pk).address } catch { return null } }
function dayKey() { return DAILY_KEY + ":" + new Date().toISOString().slice(0, 10) }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  const method = (req.method || "GET").toUpperCase()

  if (method === "GET") {
    return res.status(200).json({
      ok: true, endpoint: "swap", product: "cronus_swap",
      dex: "CronusSwap (constant-product AMM, 0.3% fee) on Arc testnet",
      pool: SWAP_POOL || null, pair: "USDC/CRN", executed_pair: "USDC/CRN",
      per_swap_cap_usdc: Number(PER_SWAP_CAP_ATOMIC) / 1e6, daily_cap_usdc: DAILY_CAP_ATOMIC / 1e6,
      default_slippage_bps: DEFAULT_SLIPPAGE_BPS, auto_signal_min_conviction: MIN_CONVICTION,
      signer: signerAddress(), dryRunDefault: true, configured: Boolean(SWAP_POOL && SWAP_TOKEN),
      honest_note: "Executed pair is USDC/CRN in Cronus's own on-chain AMM. No real BTC exists on Arc testnet; instId/topic only drive the signal via /api/consult. execKey-gated; treasury-signed; dry-run unless execute:true.",
    })
  }
  if (method !== "POST") return res.status(405).json({ ok: false, error: "method not allowed" })
  if (!SWAP_POOL || !SWAP_TOKEN) return res.status(500).json({ ok: false, error: "SWAP_POOL/SWAP_TOKEN not configured" })

  const b = safeJson(req.body)
  const execKey = String(b.execKey || (req.headers && (req.headers["x-cronus-exec-key"] || req.headers["x-exec-key"])) || "")
  const SECRET = process.env.CRONUS_EXEC_SECRET || ""
  const execute = b.execute === true || b.execute === "true" || b.execute === 1

  const side = String(b.side || "usdc_to_crn").toLowerCase()
  const tokenIn = side === "crn_to_usdc" ? SWAP_TOKEN : ARC_USDC
  const fromToken = tokenIn === ARC_USDC ? "USDC" : "CRN"
  const toToken = tokenIn === ARC_USDC ? "CRN" : "USDC"
  const slippageBps = Number(b.slippageBps === undefined || b.slippageBps === null || b.slippageBps === "" ? DEFAULT_SLIPPAGE_BPS : b.slippageBps)
  if (slippageBps < 0 || slippageBps > 5000) return res.status(400).json({ ok: false, error: "slippageBps out of range (0..5000)" })
  if (b.amountIn === undefined || b.amountIn === null || b.amountIn === "") return res.status(400).json({ ok: false, error: "required: amountIn (atomic 6dp; e.g. 100000 = 0.1)" })
  let amtAtomic
  try { amtAtomic = BigInt(String(b.amountIn)) } catch { return res.status(400).json({ ok: false, error: "amountIn must be an integer atomic amount (6dp)" }) }
  if (amtAtomic <= 0n) return res.status(400).json({ ok: false, error: "amountIn must be > 0" })

  const autoSignal = b.autoSignal === true || b.autoSignal === "true" || b.autoSignal === 1
  const instId = String(b.instId || "BTC-USDC")
  const topic = String(b.topic || (instId + " momentum"))
  let signal = null
  if (autoSignal) {
    try {
      const host = (req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "cronus-capital.vercel.app"
      const cr = await fetch("https://" + host + "/api/consult?topic=" + encodeURIComponent(topic) + "&instId=" + encodeURIComponent(instId))
      const cj = await cr.json()
      const conv = cj && (cj.conviction !== undefined ? cj.conviction : (cj.result && cj.result.conviction))
      const conviction = Number(conv)
      const verdict = (cj && (cj.verdict !== undefined ? cj.verdict : (cj.result && cj.result.verdict))) || null
      signal = { verdict, conviction }
      if (!Number.isFinite(conviction) || conviction < MIN_CONVICTION) {
        return res.status(200).json({ ok: false, rejected: true, reason: "autoSignal: conviction " + (Number.isFinite(conviction) ? conviction : "n/a") + " < " + MIN_CONVICTION + " (no swap)", signal, honest_note: "Swap gated by live /api/consult conviction." })
      }
    } catch (e) {
      return res.status(502).json({ ok: false, error: "autoSignal consult failed", detail: String((e && e.message) || e).slice(0, 200) })
    }
  }

  const publicClient = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })
  let expectedOut = 0n
  try { expectedOut = await publicClient.readContract({ address: SWAP_POOL, abi: POOL_ABI, functionName: "quote", args: [tokenIn, amtAtomic] }) }
  catch (e) { return res.status(502).json({ ok: false, error: "quote failed", detail: String((e && e.message) || e).slice(0, 200) }) }
  const minOut = (expectedOut * BigInt(10000 - slippageBps)) / 10000n
  const usdcValue = tokenIn === ARC_USDC ? amtAtomic : expectedOut
  if (usdcValue > PER_SWAP_CAP_ATOMIC) return res.status(400).json({ ok: false, error: "swap value exceeds per-swap cap (USDC-denominated)", capUsdc: Number(PER_SWAP_CAP_ATOMIC) / 1e6, swapValueUsdc: Number(usdcValue) / 1e6 })
  const preview = { pool: SWAP_POOL, side, fromToken, toToken, amountIn: String(amtAtomic), amountIn_display: Number(amtAtomic) / 1e6, amountOut: Number(expectedOut) / 1e6, expectedOut: String(expectedOut), minOut: String(minOut), slippageBps, executionPrice: Number(expectedOut) / Number(amtAtomic) }

  if (!execute) {
    return res.status(200).json({ ok: true, dryRun: true, preview, signal, honest_note: "dry-run only; no funds moved. Re-send execute:true with a valid execKey to swap. Executed pair USDC/CRN (Cronus AMM); no real BTC on Arc." })
  }

  if (emergencyPaused()) return res.status(503).json(Object.assign({ ok: false }, pauseError()))
  if (!SECRET || execKey !== SECRET) return res.status(401).json({ ok: false, error: "execKey required for execute (invalid or missing)" })
  const pk = normPk(process.env.TREASURY_PRIVATE_KEY)
  if (!pk) return res.status(500).json({ ok: false, error: "TREASURY_PRIVATE_KEY not set" })

  const usdcLeg = tokenIn === ARC_USDC ? Number(amtAtomic) : Number(expectedOut)
  const dk = dayKey()
  const spent = Number(await kvGet(dk) || 0)
  if ((spent + usdcLeg) > DAILY_CAP_ATOMIC) return res.status(429).json({ ok: false, error: "daily swap cap reached", dailyCapUsdc: DAILY_CAP_ATOMIC / 1e6, spentUsdc: spent / 1e6 })

  const kvOn = Boolean(KV_URL && KV_TOKEN)
  const nowSec = Math.floor(Date.now() / 1000)
  if (kvOn) {
    const last = Number(await kvGet(RATE_KEY) || 0)
    if (last && (nowSec - last) < 60) return res.status(409).json({ ok: false, error: "rate limited: 1 swap per minute", retryAfterSec: 60 - (nowSec - last) })
    await kvSet(RATE_KEY, String(nowSec))
  }

  try {
    const account = privateKeyToAccount(pk)
    const walletClient = createWalletClient({ account: account, chain: arcChain, transport: http(ARC_RPC) })
    let allowance = 0n
    try { allowance = await publicClient.readContract({ address: tokenIn, abi: ERC20_ABI, functionName: "allowance", args: [account.address, SWAP_POOL] }) } catch { allowance = 0n }
    if (allowance < amtAtomic) {
      const approveHash = await walletClient.writeContract({ address: tokenIn, abi: ERC20_ABI, functionName: "approve", args: [SWAP_POOL, MAX_UINT] })
      try { await publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 45000 }) }
      catch { await kvDel(RATE_KEY); return res.status(202).json({ ok: false, executed: false, pending: "approval submitted; retry execute in ~30s", approveTx: approveHash, signer: account.address }) }
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)
    const sim = await publicClient.simulateContract({ account: account, address: SWAP_POOL, abi: POOL_ABI, functionName: "swapExactIn", args: [tokenIn, amtAtomic, minOut, account.address, deadline] })
    const swapHash = await walletClient.writeContract(sim.request)
    const rcpt = await publicClient.waitForTransactionReceipt({ hash: swapHash, timeout: 60000 }).catch(() => null)
    await kvIncrByFloat(dk, usdcLeg)
    return res.status(200).json({
      ok: true, executed: true, product: "cronus_swap",
      txHash: swapHash, explorer: ARCSCAN + swapHash, status: rcpt ? rcpt.status : "submitted",
      fromToken, toToken, amountIn: String(amtAtomic), amountOut: Number(expectedOut) / 1e6, minOut: String(minOut),
      executionPrice: Number(expectedOut) / Number(amtAtomic), slippageBps, signal, signer: account.address,
      honest_note: "Real on-chain swap in Cronus's own USDC/CRN AMM on Arc (verify on arcscan). No real BTC on Arc testnet; instId only drives the signal. amountOut is the pre-trade quote; actual filled amount is in the tx logs.",
    })
  } catch (e) {
    await kvDel(RATE_KEY)
    const msg = (e && e.shortMessage) || (e && e.message) || "swap failed"
    return res.status(500).json({ ok: false, executed: false, error: String(msg).slice(0, 300) })
  }
}
