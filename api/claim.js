import { createWalletClient, createPublicClient, http, defineChain, parseUnits, getAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { checkDaily, recordDaily } from "../lib/breaker.js"

const USDC = "0x3600000000000000000000000000000000000000"
const CHAIN_ID = 5042002
const RPC_URL = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const CLAIM_USDC = process.env.CLAIM_USDC || "0.05"
const MAX_CLAIM = 1

const arc = defineChain({
  id: CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [RPC_URL] } },
})

const ERC20_ABI = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
]

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" })
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {})
    let to = String((body && body.to) || "").trim()
    if (!/^0x[0-9a-fA-F]{40}$/.test(to)) return res.status(400).json({ ok: false, error: "invalid wallet address" })
    to = getAddress(to)
    const pkRaw = process.env.TREASURY_PRIVATE_KEY
    if (!pkRaw) return res.status(500).json({ ok: false, error: "treasury not configured" })
    const account = privateKeyToAccount(pkRaw.startsWith("0x") ? pkRaw : ("0x" + pkRaw))
    const amountNum = Math.min(Number(CLAIM_USDC) || 0.05, MAX_CLAIM)
    const amount = parseUnits(String(amountNum), 6)
    const publicClient = createPublicClient({ chain: arc, transport: http(RPC_URL) })
    const walletClient = createWalletClient({ account, chain: arc, transport: http(RPC_URL) })
    const bal = await publicClient.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] })
    if (bal < amount) return res.status(400).json({ ok: false, error: "treasury out of USDC: fund " + account.address })
    await publicClient.simulateContract({ account, address: USDC, abi: ERC20_ABI, functionName: "transfer", args: [to, amount] })
    const gate = await checkDaily(String(amount))
    if (!gate.allowed && !gate.unavailable) return res.status(429).json({ ok: false, error: "daily spend cap reached", reason: gate.reason, remainingAtomic: gate.remainingAtomic })
    const hash = await walletClient.writeContract({ address: USDC, abi: ERC20_ABI, functionName: "transfer", args: [to, amount] })
    await recordDaily(String(amount))
    return res.status(200).json({ ok: true, hash, amount: String(amountNum), to, from: account.address })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) })
  }
}
