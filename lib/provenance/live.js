// lib/provenance/live.js - live inputs for the existing handlers (live-1). ADDITIVE.
// The old files are not edited: they are handed a req.query carrying REAL numbers.
// This removes the fabrication in lib/upgrades/kellyStaking.js:
//   hits: Number(hits) || 6, graded: Number(graded) || 10  =>  a 60% winrate out of thin air.
// Here the track record comes from the stake ledger, and with too little data we REFUSE to compute.
import { readStakeLedger } from "../stake.js"
import { runCouncil } from "../council/council.js"
import { fetchMarket } from "../council/handler.js"
import kellyInner from "../upgrades/kellyStaking.js"
import { wrapHandler } from "./wrap.js"

export const LIVE_VERSION = "live-1"
export const LEDGER_KEY = "kv:cronus:stakes:ledger"

// pure: counted by the statuses documented in lib/stake.js (correct/wrong/void/open)
export function trackRecordFromLedger(positions) {
  const list = Array.isArray(positions) ? positions : []
  let open = 0, correct = 0, wrong = 0, voided = 0
  for (const p of list) {
    const st = String((p && p.status) || "open").toLowerCase()
    if (st === "correct") correct += 1
    else if (st === "wrong") wrong += 1
    else if (st === "void") voided += 1
    else open += 1
  }
  const graded = correct + wrong
  const base = { hits: correct, graded, open, voided, source: LEDGER_KEY, positions: list.length }
  if (graded === 0) {
    return Object.assign(base, {
      available: false,
      reason: list.length === 0 ? "empty_ledger" : "no_resolved_positions",
      winRate: null,
    })
  }
  return Object.assign(base, {
    available: true,
    reason: "resolved_positions",
    winRate: Number((correct / graded).toFixed(4)),
  })
}

// pure: minimum sample size. Kelly on n=2 is not an estimate, it is self-deception.
export function sampleVerdict(tr, minGraded) {
  const min = Number.isFinite(Number(minGraded)) ? Number(minGraded) : 10
  if (!tr || !tr.available) return { ok: false, reason: (tr && tr.reason) || "no_track_record", minGraded: min }
  if (tr.graded < min) {
    return { ok: false, reason: "insufficient_sample", minGraded: min, graded: tr.graded, statisticallyUnreliable: true }
  }
  return { ok: true, reason: "sample_sufficient", minGraded: min, graded: tr.graded }
}

// pure: the stake cap from real configuration, not from a literal inside the handler
export function maxStakeUsdc(env) {
  const e = env || process.env
  const base = Number(e.STAKE_BASE_USDC)
  const band = Number(e.STAKE_BAND_USDC)
  const b = Number.isFinite(base) ? base : 0.05
  const d = Number.isFinite(band) ? band : 0.05
  return Number((b + d).toFixed(6))
}

const refuse = (res, body) => res.status(200).json(Object.assign({
  ok: false, kind: "kelly-stake", version: LIVE_VERSION, synthetic: false,
}, body))

export function makeLiveKelly(opts) {
  const o = opts || {}
  return async function liveKelly(req, res) {
    if (res && res.setHeader) res.setHeader("Access-Control-Allow-Origin", "*")
    const q = (req && req.query) || {}
    const env = o.env || process.env
    const readLedger = o.readLedger || readStakeLedger

    // 1) the real track record
    let tr
    try { tr = trackRecordFromLedger(await readLedger()) }
    catch (e) { tr = { available: false, reason: "ledger_unreachable", error: String((e && e.message) || e), source: LEDGER_KEY } }

    const sample = sampleVerdict(tr, env.KELLY_MIN_GRADED)
    const allowSmall = String(q.acceptSmallSample || "") === "1"
    if (!sample.ok && !(sample.reason === "insufficient_sample" && allowSmall)) {
      return refuse(res, {
        reason: sample.reason,
        trackRecord: tr,
        requirement: { minGraded: sample.minGraded, override: "?acceptSmallSample=1" },
        note: "The stake was NOT sized: the real track record is too thin. "
          + "The 6-hits-out-of-10 defaults are not substituted; that would be fabrication.",
      })
    }

    // 2) real confidence: either from the council for this instrument, or passed explicitly by the caller
    let confidence = null, verdict = null, confidenceSource = null, council = null
    if (q.confidence != null && String(q.confidence) !== "") {
      const c = Number(q.confidence)
      if (!Number.isFinite(c) || c < 0 || c > 1) return refuse(res, { reason: "confidence_invalid", got: q.confidence })
      confidence = c
      verdict = String(q.verdict || "BUY").toUpperCase()
      confidenceSource = "caller_supplied"
    } else {
      const instId = String(q.instId || q.topic || "BTC-USDC").toUpperCase()
      let market = null
      try { market = await fetchMarket(instId, o.fetchImpl) } catch (_) { market = null }
      if (!market || market.price == null) return refuse(res, { reason: "market_unavailable", instId, trackRecord: tr })
      council = await runCouncil({ topic: instId, market, opts: { env, fetchImpl: o.fetchImpl } })
      if (!council.ok || council.confidence == null) {
        return refuse(res, {
          reason: council.reason || "council_unavailable", instId, trackRecord: tr,
          councilMode: council.mode,
          note: "Without a real council verdict the conviction is unknown, and Kelly is not computed without conviction.",
        })
      }
      confidence = council.confidence
      verdict = council.consensus
      confidenceSource = "council-2:" + council.mode
    }

    // 3) the existing handler receives REAL numbers
    const cap = maxStakeUsdc(env)
    const merged = {
      confidence: String(confidence), verdict,
      hits: String(tr.hits), graded: String(tr.graded), bankroll: String(cap),
    }
    const inner = async (r, s) => kellyInner(Object.assign({}, r, { query: merged }), s)
    const wrapped = wrapHandler(inner, {
      synthetic: false,
      source: "lib/upgrades/kellyStaking.js (live inputs from " + LEDGER_KEY + ")",
      endpointKind: "kelly-stake",
      computation: "real_kelly_formula",
      inputs: "hits/graded from the stake ledger, confidence from " + confidenceSource + ", cap " + cap + " USDC from STAKE_BASE_USDC+STAKE_BAND_USDC",
      note: "The handler's 6/10 defaults are NOT used. "
        + (sample.ok ? "The sample is adequate." : "WARNING: the sample is small (graded " + tr.graded + "), so the estimate is statistically unreliable.")
        + " The bankroll parameter in the original handler actually behaves as a stake cap: "
        + "calculateConvictionStake passes maxStake as kellyStake's third argument, where a bankroll is expected.",
    })
    const capture = {
      setHeader: (...a) => res.setHeader && res.setHeader(...a),
      status: (c) => { capture._code = c; return capture },
      json: (b) => {
        return res.status(capture._code || 200).json(Object.assign({}, b, {
          trackRecord: tr,
          sample,
          confidenceUsed: confidence,
          verdictUsed: verdict,
          confidenceSource,
          council: council ? { mode: council.mode, consensus: council.consensus, confidence: council.confidence, validVotes: council.validVotes, dissent: council.dissent } : null,
        }))
      },
      _code: 200,
    }
    return wrapped(req, capture)
  }
}

const liveKelly = makeLiveKelly()

export const LIVE_ROUTES = { "kelly": liveKelly, "kelly-stake": liveKelly }
export default LIVE_ROUTES
