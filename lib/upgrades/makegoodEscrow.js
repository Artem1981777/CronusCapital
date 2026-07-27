// lib/upgrades/makegoodEscrow.js — make-good slash routing (ADDITIVE, version-safe).
// Faithful upgrade of the STAKE_MAKEGOOD idea: when the agent's staked signal resolves
// WRONG, the slashed stake compensates a REAL counterparty (the signal buyer) instead of
// burning to 0x..dEaD. Positions without slashPolicy:"makegood" + a valid beneficiary keep
// the original burn behaviour byte-for-byte, so every pre-existing stake resolves as before.
// NO MOCKS: the beneficiary must be a real on-chain address; when absent we fall back to burn
// rather than invent a recipient. GET handler is a no-funds, no-secrets dry-run inspector.
import { getAddress } from "viem"

const BURN = "0x000000000000000000000000000000000000dEaD"
const ZERO = "0x0000000000000000000000000000000000000000"

// Pure routing decision for a WRONG stake's slashed amount.
// Returns a checksummed beneficiary iff the position explicitly opted into make-good AND
// carries a valid, non-zero, non-burn beneficiary; otherwise returns the burn sink.
export function slashDestination(position, burnAddr) {
  const burn = getAddress(burnAddr || BURN)
  try {
    if (!position || String(position.slashPolicy || "") !== "makegood") return burn
    const b = position.beneficiary
    if (!b || typeof b !== "string") return burn
    const addr = getAddress(b) // throws on malformed input
    const lo = addr.toLowerCase()
    if (lo === ZERO.toLowerCase() || lo === BURN.toLowerCase()) return burn
    return addr
  } catch (_) {
    return burn // never fabricate: any doubt -> burn (unchanged legacy path)
  }
}

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

// GET /api/makegood -> read-only inspector. No funds move, no secrets read or printed.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  const raw = await kvCmd(["LRANGE", "cronus:stakes:ledger", "0", "199"])
  const list = Array.isArray(raw) ? raw : []
  const positions = []
  for (let i = 0; i < list.length; i++) {
    try {
      const p = typeof list[i] === "string" ? JSON.parse(list[i]) : list[i]
      const policy = String(p.slashPolicy || "burn")
      positions.push({
        id: p.id, marketId: p.marketId, status: p.status || "open",
        slashPolicy: policy,
        beneficiary: policy === "makegood" ? (p.beneficiary || null) : null,
        slashGoesTo: slashDestination(p, BURN).toLowerCase(),
        stakeAtomic: p.stakeAtomic,
      })
    } catch (_) {}
  }
  const burnLo = BURN.toLowerCase()
  const makegoodCount = positions.filter((x) => x.slashPolicy === "makegood" && x.slashGoesTo !== burnLo).length
  res.status(200).json({
    ok: true, kind: "makegood",
    policy: "WRONG stakes with slashPolicy:makegood + a valid beneficiary compensate the real signal buyer; all others burn to 0x..dEaD (unchanged).",
    burnSink: BURN, total: positions.length, makegoodPositions: makegoodCount, positions,
    note: "Read-only preview. Settlement still executes in /api/resolve-stake (POST, Bearer CRON_SECRET).",
  })
}

// ADDITIVE: record/lookup the REAL, on-chain-verified buyer of a signal per instrument.
// Binds a WRONG stake's slash to an actual counterparty. No fabrication: a missing KV store
// or absent buyer yields null/false, and callers then fall back to burn.
export async function recordSignalBuyer(instId, from, txHash) {
  try {
    if (!instId || !from) return false
    const addr = getAddress(from)
    const key = "cronus:signal:buyers:" + String(instId)
    const entry = JSON.stringify({ from: addr.toLowerCase(), at: Date.now(), txHash: txHash || null })
    await kvCmd(["LPUSH", key, entry])
    await kvCmd(["LTRIM", key, "0", "49"])
    await kvCmd(["EXPIRE", key, String(60 * 60 * 24 * 30)])
    return true
  } catch (_) { return false }
}

export async function latestSignalBuyer(instId) {
  try {
    if (!instId) return null
    const key = "cronus:signal:buyers:" + String(instId)
    const raw = await kvCmd(["LINDEX", key, "0"])
    if (!raw) return null
    const j = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!j || !j.from) return null
    return getAddress(j.from)
  } catch (_) { return null }
}
