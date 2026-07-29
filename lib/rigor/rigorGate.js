// lib/rigor/rigorGate.js — статистический гейт заявления об edge (rigor-1). ADDITIVE.
// Ни один существующий файл не редактируется.
//
// Зачем: /api/kelly печатает edge = b*p - q, посчитанный по трек-рекорду без
// единой поправки. Порог стратегии выбирается перебором, поэтому лучший Sharpe
// на истории завышен самим фактом перебора. RigorGate считает поправленные
// метрики и ЗАПРЕЩАЕТ заявлять преимущество, пока они его не подтверждают.
//
// Метрики:
// 1. Walk-forward: порог подбирается ТОЛЬКО на in-sample, метрика меряется на
//    отложенном out-of-sample, которого подбор не видел.
// 2. Deflated Sharpe (Bailey & Lopez de Prado): штраф за число испытаний.
// 3. PBO: доля порогов, у которых OOS-Sharpe <= 0 — вероятность переподгонки.
const OKX_CANDLES = "https://www.okx.com/api/v5/market/history-candles"

export const RIGOR_VERSION = "rigor-1"
export const DEFAULT_GRID = [0.1, 0.2, 0.3, 0.5, 0.8, 1.2]
export const MIN_BARS = 200
export const MIN_OOS_TRADES = 30
// Значимость на отложенной выборке. Deflated Sharpe штрафует за перебор, но при
// 200+ наблюдениях требует пер-периодного Sharpe всего ~0.09, и лучший из шести
// порогов перебивает эту планку случайно: на шуме получено DSR 0.99 при OOS
// t-stat 1.23. Поэтому OOS обязан быть значим сам по себе: t = srRaw * sqrt(n).
export const MIN_OOS_TSTAT = 2
export const LOOKBACK_BARS = 24

export function mean(xs) { const a = xs.filter(Number.isFinite); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0 }
export function std(xs) { const a = xs.filter(Number.isFinite); if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) }

// pure: доходности стратегии «вход после роста за LOOKBACK_BARS выше порога»
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

// Sharpe ЗА ПЕРИОД. Именно в этих единицах работает поправка Deflated Sharpe:
// её штраф равен expectedMax / sqrt(nObs-1), то есть тоже за период.
export function sharpeRaw(rets) {
  const s = std(rets)
  if (!s || rets.length < 2) return 0
  return mean(rets) / s
}

// Годовой Sharpe — ТОЛЬКО для отображения. Подставлять его в deflatedSharpe
// нельзя: множитель sqrt(8760) раздувает величину в ~93 раза и перебивает
// поправку, из-за чего гейт признаёт преимущество даже на чистом шуме.
export function sharpe(rets, periodsPerYear) {
  const p = periodsPerYear == null ? 24 * 365 : periodsPerYear
  return sharpeRaw(rets) * Math.sqrt(p)
}

// Штраф за перебор: ожидаемый максимум Sharpe при nTrials независимых попытках.
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

// Единственное место, где решается, можно ли говорить слово edge.
export function edgeVerdict(w) {
  // Строго пер-периодный Sharpe: смешение единиц уже давало ложное proven-oos.
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
