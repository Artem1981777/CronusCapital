// lib/vaultNav.js — live NAV recorder + reader for the Arc testnet vault.
// Records a REAL on-chain totalAssets() reading with a timestamp into KV
// (throttled). NEVER backfills or fabricates: the series starts empty and
// fills with genuine readings over time. Read via GET /api/info?kind=vault-nav.
import { createPublicClient, http, defineChain } from "viem"

const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID || "5042002")
const ARC_RPC = process.env.ARC_RPC || process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"
const VAULT = process.env.VAULT_ADDRESS || "0x13B6984357e27dAB17DF44a6396042239e70542C"
const KEY = "cronus:vault:nav"
const LOCK = "cronus:vault:nav:lock"
const MIN_INTERVAL_MS = Number(process.env.VAULT_NAV_INTERVAL_MS || "120000")
const MAX_POINTS = Number(process.env.VAULT_NAV_MAX || "500")

const arcChain = defineChain({ id: ARC_CHAIN_ID, name: "arc-testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [ARC_RPC] } } })
const VAULT_ABI = [{ type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }]

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

function parseList(raw) {
  const out = []
  if (Array.isArray(raw)) {
    for (const s of raw) {
      try { const o = typeof s === "string" ? JSON.parse(s) : s; if (o && typeof o.nav === "number" && o.ts) out.push({ ts: Number(o.ts), nav: Number(o.nav) }) } catch (_) { /* skip */ }
    }
  }
  return out.sort((a, b) => a.ts - b.ts)
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  let snapshots = parseList(await kvCmd(["LRANGE", KEY, "0", String(MAX_POINTS - 1)]))
  const now = Date.now()
  const last = snapshots.length ? snapshots[snapshots.length - 1] : null
  let recorded = false
  let degraded = false
  if (!last || now - last.ts >= MIN_INTERVAL_MS) {
    const lock = await kvCmd(["SET", LOCK, "1", "NX", "EX", "15"])
    if (lock === "OK") {
      try {
        const pub = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })
        const ta = await pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "totalAssets" })
        const nav = Number(ta) / 1e6
        if (nav >= 0) {
          await kvCmd(["LPUSH", KEY, JSON.stringify({ ts: now, nav })])
          await kvCmd(["LTRIM", KEY, "0", String(MAX_POINTS - 1)])
          snapshots.push({ ts: now, nav })
          snapshots = snapshots.sort((a, b) => a.ts - b.ts)
          recorded = true
        }
      } catch (_) { degraded = true } finally { await kvCmd(["DEL", LOCK]) }
    }
  }
  res.status(200).json({ ok: true, vault: VAULT, key: KEY, intervalMs: MIN_INTERVAL_MS, count: snapshots.length, recorded, degraded, note: "Live on-chain NAV readings recorded from deploy onward; never backfilled or fabricated.", snapshots })
}
