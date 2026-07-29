// lib/rigor/rigorGate.js - a statistical gate on any claim of edge (rigor-1). ADDITIVE.
// No existing file is edited.
//
// Why: /api/kelly prints edge = b*p - q computed from the track record without a
// single correction. The strategy threshold is picked by search, so the best Sharpe
// in-sample is inflated by the search itself. RigorGate computes corrected metrics
// and FORBIDS claiming an edge until they support it.
//
// Metrics:
// 1. Walk-forward: the threshold is fitted ONLY in-sample; the metric is measured on
//    a held-out out-of-sample the fitting never saw.
// 2. Deflated Sharpe (Bailey & Lopez de Prado): a penalty for the number of trials.
// 3. PBO: the share of thresholds with OOS Sharpe <= 0 - the probability of overfitting.
const OKX_CANDLES = "https://www.okx.com/api/v5/market/history-candles"

export const RIGOR_VERSION = "rigor-1"
export const DEFAULT_GRID = [0.1, 0.2, 0.3, 0.5, 0.8, 1.2]
export const MIN_BARS = 200
export const MIN_OOS_TRADES = 30
// Significance on the held-out sample. Deflated Sharpe penalizes the search, but with
// 200+ observations it demands a per-period Sharpe of only ~0.09, and the best of six
// thresholds clears that bar by chance: on pure noise we obtained DSR 0.99 with an OOS
// t-stat of 1.23. So the OOS result must be significant on its own: t = srRaw * sqrt(n).
export const MIN_OOS_TSTAT = 2
export const LOOKBACK_BARS = 24

export function mean(xs) { const a = xs.filter(Number.isFinite); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0 }
export function std(xs) { const a = xs.filter(Number.isFinite); if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) }

// pure: returns of the strategy 'enter after a LOOKBACK_BARS gain above the threshold'
export function strategyReturns(bars, thresholdPct) {
  const out = []
  for (let i = LOOKBACK_BARS; i < bars.length - 1; i += 1) {
    const base = bars[i - LOOKBACK_BARS].c
    if (!Number.isFinite(base) || base === 0) continue
    const chg = ((bars[i].c - base) / base) * 100
    if (chg >= thresholdPct) out.push((bars[i + 1].c - bars[i].c) / bars[i].c)
  }
  return out
}

// PER-PERIOD Sharpe. These are exactly the units the Deflated Sharpe correction uses:
// its penalty is expectedMax / sqrt(nObs-1), which is per-period as well.
export function sharpeRaw(rets) {
  const s = std(rets)
  if (!s || rets.length < 2) return 0
  return mean(rets) / s
}

// The annualized Sharpe is for DISPLAY ONLY. Feeding it into deflatedSharpe is
// forbidden: the sqrt(8760) factor inflates it about 93-fold and overwhelms the
// correction, which makes the gate certify an edge even on pure noise.
export function sharpe(rets, periodsPerYear) {
  const p = periodsPerYear == null ? 24 * 365 : periodsPerYear
  return sharpeRaw(rets) * Math.sqrt(p)
}

// The search penalty: the expected maximum Sharpe across nTrials independent attempts.
export function deflatedSharpe(sr, nTrials, nObs) {
  const n = Math.max(Number(nTrials) || 1, 2)
  const obs = Math.max(Number(nObs) || 0, 2)
  const gammaE = 0.5772156649015329
  const lg = Math.sqrt(2 * Math.log(n))
  const expectedMax = lg - gammaE / lg
  const srStd = 1 / Math.sqrt(obs - 1)
  return (sr - expectedMax * srStd) / srStd
}

export function walkForward(bars, grid, splitRatio) {
  const g = Array.isArray(grid) && grid.length ? grid : DEFAULT_GRID
  const ratio = Number.isFinite(splitRatio) ? splitRatio : 0.6
  const split = Math.floor(bars.length * ratio)
  const inSample = bars.slice(0, split)
  const oos = bars.slice(split)
  const trials = g.map((t) => {
    const isRets = strategyReturns(inSample, t)
    const oosRets = strategyReturns(oos, t)
    return { thresholdPct: t, inSampleSharpe: sharpe(isRets), inSampleSharpeRaw: sharpeRaw(isRets), inSampleTrades: isRets.length, oosSharpe: sharpe(oosRets), oosSharpeRaw: sharpeRaw(oosRets), oosTrades: oosRets.length }
  })
  const withTrades = trials.filter((x) => x.inSampleTrades >= 2)
  const best = (withTrades.length ? withTrades : trials).reduce((a, b) => (b.inSampleSharpe > a.inSampleSharpe ? b : a))
  const pbo = trials.length ? trials.filter((x) => x.oosSharpe <= 0).length / trials.length : 1
  return { split, inSampleBars: inSample.length, oosBars: oos.length, trials, best, pbo }
}

// The single place where it is decided whether the word edge may be used at all.
export function edgeVerdict(w) {
  // Strictly per-period Sharpe: mixing units has already produced a false proven-oos.
  const sr = w.best.inSampleSharpeRaw
  const osr = w.best.oosSharpeRaw
  if (!Number.isFinite(sr) || !Number.isFinite(osr)) throw new Error("edgeVerdict requires inSampleSharpeRaw and oosSharpeRaw (per-period Sharpe)")
  const dsr = deflatedSharpe(sr, w.trials.length, w.best.inSampleTrades)
  const tStat = osr * Math.sqrt(Math.max(w.best.oosTrades, 0))
  const reasons = []
  if (!(dsr > 0)) reasons.push("deflated_sharpe_not_positive")
  if (!(w.best.oosSharpe > 0)) reasons.push("oos_sharpe_not_positive")
  if (!(tStat >= MIN_OOS_TSTAT)) reasons.push("oos_not_statistically_significant")
  if (w.best.oosTrades < MIN_OOS_TRADES) reasons.push("oos_sample_too_small")
  if (w.pbo > 0.5) reasons.push("probability_of_overfitting_above_half")
  return {
    deflatedSharpe: Number(dsr.toFixed(4)),
    oosTStat: Number(tStat.toFixed(4)),
    edgeClaim: reasons.length === 0 ? "proven-oos" : "unproven",
    blockers: reasons,
    mayAdvertiseEdge: reasons.length === 0,
  }
}

export async function fetchCandles(o) {
  const opts = o || {}
  const f = opts.fetchImpl || fetch
  const instId = opts.instId || "BTC-USDT"
  const bar = opts.bar || "1H"
  const want = Math.max(Number(opts.limit) || 600, MIN_BARS)
  const seen = new Map()
  let after = ""
  for (let page = 0; page < 5 && seen.size < want; page += 1) {
    const url = OKX_CANDLES + "?instId=" + encodeURIComponent(instId) + "&bar=" + encodeURIComponent(bar) + "&limit=300" + (after ? "&after=" + after : "")
    let j = null
    try { const r = await f(url); if (!r || !r.ok) break; j = await r.json() } catch (e) { break }
    const rows = Array.isArray(j && j.data) ? j.data : []
    if (!rows.length) break
    for (const d of rows) { const ts = Number(d[0]); if (Number.isFinite(ts)) seen.set(ts, { ts, o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5] }) }
    after = String(rows[rows.length - 1][0])
  }
  return Array.from(seen.values()).sort((a, b) => a.ts - b.ts)
}

export function makeRigorGate(factoryOpts) {
  const fo = factoryOpts || {}
  return async function handler(req, res) {
    const q = (req && req.query) || {}
    const instId = String(q.instId || fo.instId || "BTC-USDT").toUpperCase()
    const bar = String(q.bar || fo.bar || "1H")
    const base = { kind: "rigor", version: RIGOR_VERSION, instId, bar, generatedAt: new Date().toISOString() }
    const bars = fo.bars || await fetchCandles({ instId, bar, fetchImpl: fo.fetchImpl, limit: q.limit })
    if (!bars.length) return res.status(200).json(Object.assign({}, base, { ok: false, reason: "candles_unavailable", edgeClaim: "unproven", dataProvenance: { synthetic: false, sources: ["okx:history-candles"], note: "OKX returned no candles; no edge may be claimed." } }))
    if (bars.length < MIN_BARS) return res.status(200).json(Object.assign({}, base, { ok: false, reason: "insufficient_bars", bars: bars.length, required: MIN_BARS, edgeClaim: "unproven", dataProvenance: { synthetic: false, sources: ["okx:history-candles"], note: "Fewer than " + MIN_BARS + " bars of history: the statistics are not trustworthy." } }))
    const w = walkForward(bars, fo.grid || DEFAULT_GRID, fo.splitRatio)
    const v = edgeVerdict(w)
    return res.status(200).json(Object.assign({}, base, {
      ok: true,
      bars: bars.length,
      gridSearched: (fo.grid || DEFAULT_GRID),
      chosenThresholdPct: w.best.thresholdPct,
      inSampleSharpe: Number(w.best.inSampleSharpe.toFixed(4)),
      inSampleSharpePerPeriod: Number(w.best.inSampleSharpeRaw.toFixed(6)),
      inSampleTrades: w.best.inSampleTrades,
      oosSharpe: Number(w.best.oosSharpe.toFixed(4)),
      oosSharpePerPeriod: Number(w.best.oosSharpeRaw.toFixed(6)),
      oosTrades: w.best.oosTrades,
      deflatedSharpe: v.deflatedSharpe,
      oosTStat: v.oosTStat,
      minOosTStat: MIN_OOS_TSTAT,
      probabilityOfBacktestOverfitting: Number(w.pbo.toFixed(4)),
      edgeClaim: v.edgeClaim,
      mayAdvertiseEdge: v.mayAdvertiseEdge,
      blockers: v.blockers,
      trials: w.trials.map((t) => ({ thresholdPct: t.thresholdPct, inSampleSharpe: Number(t.inSampleSharpe.toFixed(4)), oosSharpe: Number(t.oosSharpe.toFixed(4)), oosTrades: t.oosTrades })),
      relationToKelly: "The edge field in /api/kelly (b*p - q) is computed from the track record and is NOT corrected for multiple testing. edgeClaim here is the only field that may be cited as a claim of edge.",
      units: "inSampleSharpe/oosSharpe are annualized (x sqrt(8760)) for readability. Deflated Sharpe is computed on per-period Sharpe: mixing the two units manufactures a false proven-oos.",
      disclosure: "The threshold was chosen by search on in-sample data; Deflated Sharpe penalizes the number of trials, and the out-of-sample slice never saw the search. edgeClaim=unproven means no edge may be advertised publicly.",
      dataProvenance: { synthetic: false, sources: ["okx:history-candles"], computation: "deterministic_walk_forward", note: "OKX candles, deterministic computation: the same input yields the same output." },
    }))
  }
}

export const RIGOR_ROUTES = { "rigor": makeRigorGate(), "alpha-passport": makeRigorGate() }
export default makeRigorGate
