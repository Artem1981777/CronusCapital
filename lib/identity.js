// lib/identity.js — READ-ONLY on-chain ERC-8004 identity resolver for the Cronus agent.
// Reads CronusIdentityRegistry live on Arc testnet via viem. Never writes, registers, or moves funds.
import { createPublicClient, http, defineChain } from "viem"

const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID || "5042002")
const ARC_RPC = process.env.ARC_RPC || process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"
const REGISTRY = process.env.IDENTITY_REGISTRY || "0x252cAA46b9b0648908000f6C87e0a561DB4dEb6c"
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/

const arcChain = defineChain({ id: ARC_CHAIN_ID, name: "arc-testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [ARC_RPC] } } })

const AGENT_TUPLE = { type: "tuple", components: [
  { name: "agentId", type: "uint256" },
  { name: "agentAddress", type: "address" },
  { name: "agentDomain", type: "string" },
  { name: "metadataURI", type: "string" },
  { name: "owner", type: "address" },
  { name: "registeredAt", type: "uint256" },
  { name: "updatedAt", type: "uint256" },
] }
const ABI = [
  { type: "function", name: "agentCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "resolveById", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [AGENT_TUPLE] },
  { type: "function", name: "resolveByAddress", stateMutability: "view", inputs: [{ name: "agentAddress", type: "address" }], outputs: [AGENT_TUPLE] },
  { type: "function", name: "isRegistered", stateMutability: "view", inputs: [{ name: "agentAddress", type: "address" }], outputs: [{ type: "bool" }] },
]

function fmtAgent(a) {
  if (!a) return null
  const rAt = Number(a.registeredAt)
  const uAt = Number(a.updatedAt)
  return {
    agentId: Number(a.agentId),
    agentAddress: a.agentAddress,
    agentDomain: a.agentDomain,
    metadataURI: a.metadataURI,
    owner: a.owner,
    registeredAt: rAt,
    registeredAtIso: rAt ? new Date(rAt * 1000).toISOString() : null,
    updatedAt: uAt,
    updatedAtIso: uAt ? new Date(uAt * 1000).toISOString() : null,
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Cache-Control", "public, max-age=30")
  const q = req.query || {}
  const addr = String(q.address || q.agentAddress || "").trim()
  const idRaw = String(q.agentId || "").trim()
  const base = {
    ok: true,
    product: "cronus_identity",
    standard: "ERC-8004 (Trustless Agents — Identity layer)",
    registry: REGISTRY,
    network: "arc-testnet",
    chainId: ARC_CHAIN_ID,
    explorer: "https://testnet.arcscan.app/address/" + REGISTRY,
    read_only: true,
    note: "Live on-chain read of CronusIdentityRegistry via viem. Never writes, registers, or moves funds.",
  }
  if (addr && !ADDR_RE.test(addr)) { res.status(400).json(Object.assign({}, base, { ok: false, status: "bad_request", error: "address must be 0x + 40 hex" })); return }
  let id = 1
  if (!addr) {
    id = idRaw ? Number(idRaw) : 1
    if (!Number.isInteger(id) || id < 1) { res.status(400).json(Object.assign({}, base, { ok: false, status: "bad_request", error: "agentId must be a positive integer" })); return }
  }
  try {
    const pub = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })
    const count = await pub.readContract({ address: REGISTRY, abi: ABI, functionName: "agentCount" })
    let agent = null
    let resolvedBy = null
    if (addr) {
      resolvedBy = "address"
      try { agent = fmtAgent(await pub.readContract({ address: REGISTRY, abi: ABI, functionName: "resolveByAddress", args: [addr.toLowerCase()] })) } catch (_) { agent = null }
    } else {
      resolvedBy = "agentId"
      try { agent = fmtAgent(await pub.readContract({ address: REGISTRY, abi: ABI, functionName: "resolveById", args: [BigInt(id)] })) } catch (_) { agent = null }
    }
    res.status(200).json(Object.assign({}, base, {
      agentCount: Number(count),
      resolvedBy,
      queried: addr ? addr.toLowerCase() : id,
      registered: !!agent,
      status: agent ? "resolved" : "not_registered",
      resolved_onchain: true,
      agent,
    }))
  } catch (e) {
    res.status(200).json(Object.assign({}, base, { degraded: true, resolved_onchain: false, status: "rpc_unavailable", error: String((e && e.message) || e) }))
  }
}
