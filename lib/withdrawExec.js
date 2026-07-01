// lib/withdrawExec.js — LIVE cross-chain withdraw Arc -> any EVM via Circle CCTP
// depositForBurn, signed by the Cronus treasury. Routed via /api/info?kind=agent-withdraw
// (no new serverless function). DRY-RUN BY DEFAULT: a real burn requires execute:true.
// Guards: per-payout cap + shared daily breaker + execlock + on-chain simulate.
import { createWalletClient, createPublicClient, http, defineChain } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { buildBurnArgs, CCTP_DEPOSIT_FOR_BURN_ABI, DEST_USDC, supportedChains } from "./withdraw.js"
import { checkDaily, recordDaily } from "./breaker.js"

const ARC_USDC = "0x3600000000000000000000000000000000000000"
const ARC_TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA"
const ARC_RPC = "https://rpc.testnet.arc.network"
const ARCSCAN = "https://testnet.arcscan.app/tx/"
const ARC_CHAIN_ID = 5042002
const LOCK_KEY = "cronus:withdraw:execlock"
const KV_URL = process.env.KV_REST_API_URL || ""
const KV_TOKEN = process.env.KV_REST_API_TOKEN || ""
const MAX_UINT = (2n ** 256n) - 1n

const arcChain = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
})

const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
]

function normPk(pk) {
  const t = (pk || "").trim()
  if (!t) return ""
  return t.indexOf("0x") === 0 ? t : "0x" + t
}

function toUnits(amount, decimals) {
  const s = String(amount).trim()
  if (!s) return 0n
  const parts = s.split(".")
  const whole = parts[0] || "0"
  let frac = parts[1] || ""
  frac = (frac + "0".repeat(decimals)).slice(0, decimals)
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(frac || "0")
}

function safeJson(v) {
  if (!v) return {}
  if (typeof v === "object") return v
  try { return JSON.parse(v) } catch { return {} }
}

async function kvCmd(path) {
  if (!KV_URL || !KV_TOKEN) return null
  try {
    const r = await fetch(KV_URL + path, { headers: { Authorization: "Bearer " + KV_TOKEN } })
    if (!r.ok) return null
    const j = await r.json()
    return j.result
  } catch { return null }
}
async function kvLock(key, sec) { return await kvCmd("/set/" + encodeURIComponent(key) + "/1?NX=true&EX=" + sec) }
async function kvDel(key) { return await kvCmd("/del/" + encodeURIComponent(key)) }

function signerAddress() {
  const pk = normPk(process.env.TREASURY_PRIVATE_KEY)
  if (!pk) return null
  try { return privateKeyToAccount(pk).address } catch { return null }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  const method = (req.method || "GET").toUpperCase()
  const capAtomic = BigInt(process.env.WITHDRAW_CAP_ATOMIC || "1000000")

  if (method === "GET") {
    return res.status(200).json({
      ok: true,
      endpoint: "agent-withdraw",
      rail: "cctp-depositForBurn",
      source: "Arc testnet (CCTP domain 26)",
      supportedChains: supportedChains(),
      destUsdc: DEST_USDC,
      perPayoutCapAtomic: String(capAtomic),
      dryRunDefault: true,
      signer: signerAddress(),
      honesty: "Burn is signed by the Cronus treasury and verifiable on arcscan. Destination USDC mint completes via Circle CCTP attestation relay; no destination tx hash is fabricated. Pass execute:true to submit a real burn (bounded by per-payout cap + shared daily breaker).",
    })
  }

  if (method !== "POST") return res.status(405).json({ ok: false, error: "method not allowed" })

  const b = safeJson(req.body)
  const to = String(b.to || b.recipient || "")
  const chain = String(b.chain || b.destChain || "")
  const amount = b.amount
  const execute = b.execute === true || b.execute === "true" || b.execute === 1

  if (!to || !chain || amount === undefined || amount === null || amount === "") {
    return res.status(400).json({ ok: false, error: "required: to (EVM address), chain, amount (USDC)" })
  }

  const amtAtomic = toUnits(amount, 6)
  if (amtAtomic <= 0n) return res.status(400).json({ ok: false, error: "amount rounds to zero" })
  if (amtAtomic > capAtomic) return res.status(400).json({ ok: false, error: "amount exceeds per-payout cap", capAtomic: String(capAtomic), requestedAtomic: String(amtAtomic) })

  let plan
  try {
    const maxFeeAtomic = (b.maxFee === undefined || b.maxFee === null || b.maxFee === "") ? undefined : String(toUnits(b.maxFee, 6))
    plan = buildBurnArgs({ amountAtomic: String(amtAtomic), destChain: chain, recipient: to, maxFeeAtomic })
  } catch (e) {
    return res.status(400).json({ ok: false, error: String((e && e.message) || e) })
  }

  const planOut = {
    rail: "cctp-depositForBurn",
    destChain: chain,
    domain: plan.domain,
    recipient: to,
    mintRecipient: plan.mintRecipient,
    burnToken: plan.burnToken,
    destinationCaller: plan.destinationCaller,
    tokenMessenger: ARC_TOKEN_MESSENGER,
    amountAtomic: String(amtAtomic),
    maxFeeAtomic: String(plan.maxFee),
    minFinalityThreshold: plan.minFinalityThreshold,
    destUsdc: DEST_USDC[chain] || null,
  }

  if (!execute) {
    return res.status(200).json({ ok: true, dryRun: true, plan: planOut, note: "dry-run only; no funds moved. Re-send with execute:true to submit the burn." })
  }

  const pk = normPk(process.env.TREASURY_PRIVATE_KEY)
  if (!pk) return res.status(500).json({ ok: false, error: "TREASURY_PRIVATE_KEY not set" })

  const gate = await checkDaily(String(amtAtomic))
  if (!gate.allowed && !gate.unavailable) {
    return res.status(429).json({ ok: false, error: "daily spend breaker tripped", remainingAtomic: String(gate.remainingAtomic), dailyCapAtomic: String(gate.dailyCapAtomic) })
  }

  const kvOn = Boolean(KV_URL && KV_TOKEN)
  const lock = await kvLock(LOCK_KEY, 60)
  if (kvOn && lock !== "OK") return res.status(409).json({ ok: false, error: "withdraw already in progress (execlock)" })

  try {
    const account = privateKeyToAccount(pk)
    const publicClient = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })
    const walletClient = createWalletClient({ account: account, chain: arcChain, transport: http(ARC_RPC) })

    let allowance = 0n
    try { allowance = await publicClient.readContract({ address: ARC_USDC, abi: ERC20_ABI, functionName: "allowance", args: [account.address, ARC_TOKEN_MESSENGER] }) } catch { allowance = 0n }
    if (allowance < amtAtomic) {
      const approveHash = await walletClient.writeContract({ address: ARC_USDC, abi: ERC20_ABI, functionName: "approve", args: [ARC_TOKEN_MESSENGER, MAX_UINT] })
      try {
        await publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 45000 })
      } catch {
        await kvDel(LOCK_KEY)
        return res.status(202).json({ ok: false, executed: false, pending: "approval submitted; retry execute in about 30 seconds", approveTx: approveHash, signer: account.address })
      }
    }

    const sim = await publicClient.simulateContract({ account: account, address: ARC_TOKEN_MESSENGER, abi: CCTP_DEPOSIT_FOR_BURN_ABI, functionName: "depositForBurn", args: plan.args })
    const burnHash = await walletClient.writeContract(sim.request)
    await recordDaily(String(amtAtomic))
    await kvDel(LOCK_KEY)

    return res.status(200).json({
      ok: true,
      executed: true,
      rail: "cctp-depositForBurn",
      burnTx: burnHash,
      explorer: ARCSCAN + burnHash,
      signer: account.address,
      destChain: chain,
      domain: plan.domain,
      recipient: to,
      amountAtomic: String(amtAtomic),
      mint: { status: "pending_attestation", note: "Burn submitted on Arc (verify on arcscan). Destination USDC mint on " + chain + " completes after Circle CCTP attestation; not fabricated." },
    })
  } catch (e) {
    await kvDel(LOCK_KEY)
    const msg = (e && e.shortMessage) || (e && e.message) || "execution failed"
    return res.status(500).json({ ok: false, executed: false, error: String(msg).slice(0, 300) })
  }
}
