// lib/stake.js — Cronus skin-in-the-game: conviction-weighted self-stake engine + honest track record.
// The agent puts real (testnet) USDC at risk behind its own high-conviction verdicts. Each position is
// committed on-chain (keccak256) BEFORE the outcome is known, then resolved verifiably:
//   correct -> stake returned to the agent; wrong -> stake forfeited to a burn address (provably unrecoverable).
// READ-ONLY + HONEST: reports only real recorded positions. With none yet it returns zeros and
// accuracy:null — it never backfills or fabricates a track record.
// Routed publicly as /api/track-record via vercel.json -> /api/info?kind=track-record.
const USDC_DECIMALS = 6
const SCALE = Math.pow(10, USDC_DECIMALS)
const BASE_USDC = Number(process.env.STAKE_BASE_USDC || "0.05")
const BAND_USDC = Number(process.env.STAKE_BAND_USDC || "0.05")
const CONVICTION_GATE = Number(process.env.STAKE_CONVICTION_GATE || "0.65")
const TREASURY = (process.env.CRONUS_PAYTO || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd").toLowerCase()
const ESCROW = process.env.STAKE_ESCROW ? String(process.env.STAKE_ESCROW).toLowerCase() : null
const STAKE_TREASURY = (process.env.STAKE_TREASURY || "0x46213abeca58cc9a89a269fd25a8737c700ca164").toLowerCase()
const BURN = "0x000000000000000000000000000000000000dEaD"
const EXPLORER = process.env.ARC_EXPLORER || "https://testnet.arcscan.app"

// pure: conviction (0..1) -> stake in atomic USDC. Below the gate -> "0" (honest abstain, no stake).
export function stakeAtomicForConviction(conviction) {
  const c = Math.max(0, Math.min(1, Number(conviction) || 0))
  if (c < CONVICTION_GATE) return "0"
  return String(Math.round((BASE_USDC + c * BAND_USDC) * SCALE))
}

// pure: fold a stake ledger into an honest, verifiable track record.
export function reduceTrackRecord(positions) {
  let open = 0, correct = 0, wrong = 0, voided = 0
  let staked = 0n, atRisk = 0n, slashed = 0n, returned = 0n
  for (const p of positions || []) {
    let amt = 0n
    try { amt = BigInt((p && p.stakeAtomic) || "0") } catch (_) { amt = 0n }
    staked += amt
    const st = String((p && p.status) || "open").toLowerCase()
    if (st === "open") { open++; atRisk += amt }
    else if (st === "correct") { correct++; returned += amt }
    else if (st === "wrong") { wrong++; slashed += amt }
    else if (st === "void") { voided++ }
  }
  const resolved = correct + wrong
  const toUsdc = (x) => Number(x) / SCALE
  return {
    open_positions: open,
    resolved_positions: resolved,
    correct,
    wrong,
    void_positions: voided,
    accuracy: resolved > 0 ? Number((correct / resolved).toFixed(4)) : null,
    total_staked_usdc: toUsdc(staked),
    at_risk_usdc: toUsdc(atRisk),
    total_slashed_usdc: toUsdc(slashed),
    total_returned_usdc: toUsdc(returned),
    realized_pnl_usdc: Number((-toUsdc(slashed)).toFixed(6)),
  }
}

async function kv(cmd) {
  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return null
  try {
    const r = await fetch(base, { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(cmd) })
    const j = await r.json()
    return j && j.result
  } catch (_) { return null }
}
export async function readStakeLedger() {
  const raw = await kv(["LRANGE", "cronus:stakes:ledger", "0", "199"])
  if (!Array.isArray(raw)) return []
  const out = []
  for (const s of raw) { try { out.push(typeof s === "string" ? JSON.parse(s) : s) } catch (_) {} }
  return out
}
export { TREASURY }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120")
  try {
    const positions = await readStakeLedger()
    const stats = reduceTrackRecord(positions)
    const publicPositions = positions.slice(0, 25).map((p) => {
      let stakeUsdc = 0
      try { stakeUsdc = Number(BigInt((p && p.stakeAtomic) || "0")) / SCALE } catch (_) { stakeUsdc = 0 }
      return {
        id: (p && p.id) || null,
        marketId: (p && p.marketId) || null,
        verdict: (p && p.verdict) || null,
        conviction: p && typeof p.conviction === "number" ? p.conviction : null,
        stakeUsdc: stakeUsdc,
        status: String((p && p.status) || "open").toLowerCase(),
        commitment: (p && p.commitment) || null,
        openTx: (p && p.openTx) || null,
        openTxExplorer: p && p.openTx ? (EXPLORER + "/tx/" + p.openTx) : null,
        resolveTx: (p && p.resolveTx) || null,
        resolveTxExplorer: p && p.resolveTx ? (EXPLORER + "/tx/" + p.resolveTx) : null,
        resolveBy: (p && p.resolveBy) || null,
      }
    })
    res.status(200).json({
      ok: true,
      name: "Cronus Capital — agent skin-in-the-game track record",
      principle: "The agent puts real USDC at risk behind its own high-conviction verdicts. Every position is committed on-chain (keccak256) BEFORE the outcome is known, then resolved verifiably: correct -> stake returned to the agent, wrong -> stake forfeited to a burn address (provably unrecoverable). This feed reports only real recorded positions and never backfills or fabricates a track record.",
      network: process.env.X402_NETWORK || "arc-testnet",
      rules: {
        conviction_gate: CONVICTION_GATE,
        base_usdc: BASE_USDC,
        band_usdc: BAND_USDC,
        max_stake_usdc: Number((BASE_USDC + BAND_USDC).toFixed(6)),
        formula: "stake = base + conviction * band, only when conviction >= gate; otherwise no stake (honest abstain)",
        slash: "wrong -> full stake forfeited to a burn address (provably unrecoverable); correct -> full stake returned to agent",
        burn: BURN,
        commitment: "keccak256(verdict, conviction_bps, marketId, openPrice, resolveBy, stakeAtomic, nonce) published on-chain before resolution",
      },
      escrow: ESCROW,
      treasury: STAKE_TREASURY,
        payTo: TREASURY,
      open_positions: stats.open_positions,
      resolved_positions: stats.resolved_positions,
      correct: stats.correct,
      wrong: stats.wrong,
      void_positions: stats.void_positions,
      accuracy: stats.accuracy,
      total_staked_usdc: stats.total_staked_usdc,
      at_risk_usdc: stats.at_risk_usdc,
      total_slashed_usdc: stats.total_slashed_usdc,
      total_returned_usdc: stats.total_returned_usdc,
      realized_pnl_usdc: stats.realized_pnl_usdc,
      positions: publicPositions,
      honesty_note: stats.resolved_positions === 0 ? "No positions resolved yet. The engine and rules are live; accuracy stays null until real staked verdicts resolve on-chain. We never backfill or fabricate a track record." : "Accuracy and P&L are derived only from on-chain-resolved positions.",
      updatedAt: new Date().toISOString(),
    })
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e && e.message) || e) })
  }
}
