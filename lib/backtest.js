// lib/backtest.js — honest Brier score + calibration over Cronus's OWN on-chain-resolved stakes.
// Reads the same ledger as /api/track-record. Scores ONLY resolved positions (correct/wrong).
// p = the conviction pre-committed on-chain BEFORE the outcome was known (0..1, the agent's
// P(call correct)); o = 1 if the on-chain resolution == correct, else 0. Brier = mean((p-o)^2).
// Lower is better; skillScore>0 beats always predicting the base rate. Never backfills or
// fabricates: with no resolved positions, brier stays null.
// Routed publicly as /api/backtest via vercel.json -> /api/info?kind=backtest.
import { readStakeLedger } from "./stake.js"

const EXPLORER = process.env.ARC_EXPLORER || "https://testnet.arcscan.app"

function round4(x) { return Number(Number(x).toFixed(4)) }

// pure: conviction (0..1 or 0..100) -> probability in [0,1], or null if not numeric.
export function normProb(conviction) {
  let c = Number(conviction)
  if (!isFinite(c)) return null
  if (c > 1) c = c / 100
  return Math.max(0, Math.min(1, c))
}

// pure: ledger -> resolved samples { p, outcome, ... }.
export function resolvedFromLedger(positions) {
  const out = []
  for (const p of positions || []) {
    const st = String((p && p.status) || "open").toLowerCase()
    if (st !== "correct" && st !== "wrong") continue
    const prob = normProb(p && p.conviction)
    if (prob == null) continue
    out.push({
      id: (p && p.id) || null,
      marketId: (p && p.marketId) || null,
      verdict: (p && p.verdict) || null,
      p: prob,
      outcome: st === "correct" ? 1 : 0,
      openPrice: (p && typeof p.openPrice === "number") ? p.openPrice : null,
      resolvePrice: (p && typeof p.resolvePrice === "number") ? p.resolvePrice : null,
      resolveTx: (p && p.resolveTx) || null,
    })
  }
  return out
}

// pure: Brier score + base-rate baseline + skill.
export function brier(samples) {
  const n = (samples || []).length
  if (n === 0) return { n: 0, brier: null, baseBrier: null, skillScore: null, baseRate: null, accuracy: null }
  let se = 0, wins = 0
  for (const s of samples) { se += (s.p - s.outcome) ** 2; wins += s.outcome }
  const brierScore = se / n
  const baseRate = wins / n
  let baseSe = 0
  for (const s of samples) baseSe += (baseRate - s.outcome) ** 2
  const baseBrier = baseSe / n
  const skillScore = baseBrier > 0 ? 1 - brierScore / baseBrier : null
  return {
    n,
    brier: round4(brierScore),
    baseBrier: round4(baseBrier),
    skillScore: skillScore == null ? null : round4(skillScore),
    baseRate: round4(baseRate),
    accuracy: round4(wins / n),
  }
}

// pure: reliability-curve calibration bins.
export function calibration(samples, binCount) {
  const bins = Math.max(1, Number(binCount) || 5)
  const buckets = []
  for (let i = 0; i < bins; i++) buckets.push({ lo: i / bins, hi: (i + 1) / bins, count: 0, sumP: 0, wins: 0 })
  for (const s of samples || []) {
    let idx = Math.floor(s.p * bins)
    if (idx >= bins) idx = bins - 1
    if (idx < 0) idx = 0
    const b = buckets[idx]
    b.count++; b.sumP += s.p; b.wins += s.outcome
  }
  return buckets.map((b) => ({
    range: [round4(b.lo), round4(b.hi)],
    count: b.count,
    mean_predicted: b.count ? round4(b.sumP / b.count) : null,
    empirical_accuracy: b.count ? round4(b.wins / b.count) : null,
  }))
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120")
  try {
    const positions = await readStakeLedger()
    const openCount = (positions || []).filter((p) => String((p && p.status) || "open").toLowerCase() === "open").length
    const samples = resolvedFromLedger(positions)
    const bins = Number((req.query && req.query.bins) || 5)
    const stats = brier(samples)
    const cal = calibration(samples, bins)
    res.status(200).json({
      ok: true,
      name: "Cronus Capital — signal backtest (Brier + calibration)",
      principle: "Brier score and calibration are computed ONLY over Cronus's own on-chain-resolved stakes (the same ledger as /api/track-record). p = the conviction pre-committed on-chain before the outcome was known; o = the verifiable on-chain resolution (correct=1, wrong=0). Lower Brier is better; skill_score>0 means better than always predicting the base rate. We never backfill or fabricate: with no resolved positions, brier stays null.",
      network: process.env.X402_NETWORK || "arc-testnet",
      method: {
        probability: "p = pre-committed conviction (0..1), the agent's P(call correct)",
        outcome: "o = 1 if on-chain resolution == correct, else 0",
        brier: "mean((p - o)^2) over resolved positions",
        baseline: "base_brier = mean((base_rate - o)^2); skill_score = 1 - brier/base_brier",
        source: "same ledger as /api/track-record; each position's resolution rule is its committed openPrice vs OKX last at resolveBy",
      },
      open_positions: openCount,
      resolved_positions: stats.n,
      brier: stats.brier,
      base_brier: stats.baseBrier,
      skill_score: stats.skillScore,
      base_rate: stats.baseRate,
      accuracy: stats.accuracy,
      calibration_bins: cal,
      samples: samples.slice(0, 25).map((s) => Object.assign({}, s, { resolveTxExplorer: s.resolveTx ? EXPLORER + "/tx/" + s.resolveTx : null })),
      honesty_note: stats.n === 0 ? "No positions resolved yet. Scoring is live but Brier stays null until real staked verdicts resolve on-chain. We never backfill or fabricate." : "Brier and calibration derive only from on-chain-resolved positions.",
      verify: { trackRecord: "/api/track-record", resolveStake: "/api/resolve-stake (GET = no-funds preview)" },
      updatedAt: new Date().toISOString(),
    })
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e && e.message) || e) })
  }
}
