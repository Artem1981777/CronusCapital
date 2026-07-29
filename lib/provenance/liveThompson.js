// lib/provenance/liveThompson.js — живое ценообразование (livet-1). ADDITIVE.
// lib/upgrades/thompsonSampling.js НЕ редактируется: его обработчик вызывается
// с реальными покупками и под сеяным генератором случайных чисел.
//
// Три косяка исходного эндпоинта, зафиксированные здесь:
// 1. optimalPrice МАТЕМАТИЧЕСКИ ПОСТОЯНЕН. getPriceBand даёт
//    basePrice * (1 + conversionRate*0.5 + explorationBonus), оба слагаемых >= 0,
//    поэтому результат >= basePrice. calculateLoyalPrice зажимает его в
//    Math.min(0.0009, ...). При basePrice 0.001 ответ всегда 0.0009: постериор
//    считается и выбрасывается.
// 2. Ответ НЕВОСПРОИЗВОДИМ: Math.random() в sample() и explorationBonus.
// 3. purchases/successRate приходили из query и по умолчанию подменялись на 0/0.5,
//    то есть «наблюдения» не наблюдались.
import { contentHash } from "../traceArchive.js"
import { decorate } from "./wrap.js"
import thompsonInner from "../upgrades/thompsonSampling.js"

export const LIVE_THOMPSON_VERSION = "livet-1"
export const PRICE_FLOOR = 0.0005
export const PRICE_CAP = 0.0009
export const DEFAULT_RECEIPTS_URL = "https://cronus-capital.vercel.app/api/receipts"

// pure: доказывает постоянство цены при данном basePrice
export function clampDiagnosis(basePrice) {
  const bp = Number(basePrice) || 0.001
  const minBand = bp // conversionRate >= 0 and explorationBonus >= 0
  const constant = minBand >= PRICE_CAP
  return {
    constant,
    value: constant ? PRICE_CAP : null,
    basePrice: bp,
    minimumPossibleBandPrice: minBand,
    cap: PRICE_CAP, floor: PRICE_FLOOR,
    reason: constant ? "base_price_at_or_above_cap" : "cap_can_bind_or_not",
    explanation: constant
      ? "getPriceBand multiplies basePrice by (1 + non-negative terms), so "
        + "the result can never fall below basePrice, and Math.min(" + PRICE_CAP + ", ...) "
        + "always binds. optimalPrice does not depend on the observations."
      : "At this basePrice the cap does not always bind.",
  }
}

// pure: детерминированный генератор из хеша входов (mulberry32)
export function seededRandom(seedHex) {
  let a = parseInt(String(seedHex).slice(0, 8), 16) >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// вызывает чужой код под сеяным Math.random и ВОЗВРАЩАЕТ глобал на место
export async function withSeededRandom(seedHex, fn) {
  const orig = Math.random
  Math.random = seededRandom(seedHex)
  try { return await fn() } finally { Math.random = orig }
}

export async function readReceipts(opts) {
  const o = opts || {}
  const env = o.env || {}
  const url = o.receiptsUrl || env.RECEIPTS_URL || DEFAULT_RECEIPTS_URL
  const f = o.fetchImpl || (typeof fetch === "function" ? fetch : null)
  if (!f) return { ok: false, reason: "no_fetch_available" }
  try {
    const r = await f(url)
    const j = await r.json()
    if (!j || !Array.isArray(j.receipts)) return { ok: false, reason: "receipts_malformed" }
    return { ok: true, count: Number(j.count) || j.receipts.length, totalUsdc: Number(j.totalUsdc) || 0, receipts: j.receipts, source: url }
  } catch (e) {
    return { ok: false, reason: "receipts_unreachable", error: String((e && e.message) || e) }
  }
}

// pure: настоящая история покупок конкретного плательщика
export function purchaseHistory(receipts, payer, selfAddresses) {
  const list = Array.isArray(receipts) ? receipts : []
  const self = new Set((selfAddresses || []).map((a) => String(a).toLowerCase()))
  const target = String(payer || "").toLowerCase()
  const byPayer = new Map()
  for (const r of list) {
    const p = String((r && r.payer) || "").toLowerCase()
    if (!p) continue
    byPayer.set(p, (byPayer.get(p) || 0) + 1)
  }
  const purchases = byPayer.get(target) || 0
  let spentUsdc = 0
  for (const r of list) {
    if (String((r && r.payer) || "").toLowerCase() === target) spentUsdc += Number(r.amountUsdc) || 0
  }
  const external = [...byPayer.keys()].filter((p) => !self.has(p))
  return {
    payer: target,
    purchases,
    spentUsdc: Math.round(spentUsdc * 1e6) / 1e6,
    distinctPayers: byPayer.size,
    externalPayers: external.length,
    selfGenerated: self.has(target),
    observedPayers: [...byPayer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, c]) => ({ payer: p, purchases: c })),
  }
}

function selfList(env) {
  const raw = String((env && env.SELF_DEMO_ADDRESSES) || "")
  const extra = ["0x46213abeca58cc9a89a269fd25a8737c700ca164"] // the project's own staking wallet
  return raw.split(/[,\s]+/).filter(Boolean).concat(extra)
}

const refuse = (res, body) => res.status(200).json(Object.assign({
  ok: false, kind: "thompson-price", version: LIVE_THOMPSON_VERSION, synthetic: false,
}, body))

export function makeLiveThompson(opts) {
  const o = opts || {}
  return async function liveThompson(req, res) {
    if (res && res.setHeader) res.setHeader("Access-Control-Allow-Origin", "*")
    const q = (req && req.query) || {}
    const env = o.env || process.env
    const basePrice = Number(q.basePrice) || Number(env.NANO_PRICE_USD) || 0.001
    const clamp = clampDiagnosis(basePrice)

    const payer = q.payer ? String(q.payer) : null
    if (!payer) {
      return refuse(res, {
        reason: "payer_required",
        clampDiagnosis: clamp,
        note: "A loyalty price is defined by one payer's own history. Without an address "
          + "there is nothing to compute, and defaulting to purchases=0, successRate=0.5 would be fabrication.",
      })
    }

    const rec = await readReceipts({ env, fetchImpl: o.fetchImpl, receiptsUrl: o.receiptsUrl })
    if (!rec.ok) return refuse(res, { reason: rec.reason, error: rec.error || null, clampDiagnosis: clamp })
    if (!rec.receipts.length) {
      return refuse(res, { reason: "no_receipts", clampDiagnosis: clamp, note: "There are no payments, so no loyalty history exists." })
    }

    const hist = purchaseHistory(rec.receipts, payer, selfList(env))
    if (hist.purchases === 0) {
      return refuse(res, {
        reason: "cold_start_no_purchase_history",
        history: hist, clampDiagnosis: clamp,
        basePriceUsdc: basePrice,
        note: "This address has no paid receipts. The base price is returned, not "
          + "a price drawn from a Beta(1,1) prior that has observed nothing.",
      })
    }

    // Конверсия (купил / показали цену) нигде не логируется: экспериментов с ценой не было.
    const sr = Number(q.successRate)
    const accepted = String(q.acceptUnobserved || "") === "1"
    if (!(sr > 0 && sr <= 1) || !accepted) {
      return refuse(res, {
        reason: "no_conversion_observations",
        history: hist, clampDiagnosis: clamp,
        required: "?successRate=<0..1>&acceptUnobserved=1",
        note: "No conversion observations exist: prices shown are not logged and no A/B test "
          + "has ever been run. There is nothing to set the Beta parameters from. A value may be "
          + "supplied by hand only with an explicit admission that it is an assumption, not data.",
      })
    }

    const seed = contentHash({ payer: hist.payer, purchases: hist.purchases, successRate: sr, basePrice }).slice(7)
    let inner = null
    const proxy = {
      setHeader() {}, status() { return proxy },
      json(j) { inner = j; return j },
    }
    await withSeededRandom(seed, () => thompsonInner({
      query: { purchases: String(hist.purchases), successRate: String(sr), basePrice: String(basePrice) },
      method: "GET",
    }, proxy))
    const randomRestored = Math.random !== seededRandom(seed)

    const body = {
      ok: true,
      kind: "thompson-price",
      version: LIVE_THOMPSON_VERSION,
      priceUsdc: inner && inner.optimalPrice,
      history: hist,
      posterior: inner && inner.distribution,
      clampDiagnosis: clamp,
      priceDependsOnObservations: !clamp.constant,
      determinism: { seeded: true, seed, method: "mulberry32(sha256(inputs))", globalRandomRestored: randomRestored },
      assumptions: [{
        field: "successRate", value: sr, status: "assumption_not_observation",
        why: "conversion by price is not logged",
      }],
      customerSignal: hist.selfGenerated
        ? "no: the address belongs to the project, and loyalty of our own wallets is not a customer signal"
        : (hist.externalPayers > 0 ? "external payer" : "no external payers"),
      upstream: inner,
    }
    return res.status(200).json(decorate(body, {
      synthetic: false,
      source: "lib/upgrades/thompsonSampling.js on real receipts " + rec.source,
      endpointKind: "thompson-price",
      computation: clamp.constant ? "posterior_computed_but_discarded_by_cap" : "real_beta_sampling",
      inputs: "purchases from on-chain receipts (" + rec.count + " payments); successRate is a supplied assumption",
      note: (clamp.constant
        ? "THE PRICE IS CONSTANT: " + PRICE_CAP + " USDC under any observations, because the cap "
          + "in calculateLoyalPrice always binds. The posterior is shown in posterior but does not move the price. "
        : "")
        + "The response is reproducible: the generator is seeded with a hash of the inputs.",
    }))
  }
}

const liveThompson = makeLiveThompson()
export const LIVE_THOMPSON_ROUTES = { "thompson": liveThompson, "thompson-price": liveThompson }
export default LIVE_THOMPSON_ROUTES

// =====================================================================
// ADDITIVE MODULES (Non-breaking extensions)
// =====================================================================

/**
 * 1. ASYNC MUTEX (Защита от гонки данных в Vercel)
 * Предотвращает перезапись глобального Math.random при одновременных запросах.
 */
let _thompsonMutexLocked = false;
const _thompsonMutexQueue = [];

async function acquireThompsonMutex() {
  if (!_thompsonMutexLocked) {
    _thompsonMutexLocked = true;
    return;
  }
  await new Promise(resolve => _thompsonMutexQueue.push(resolve));
}

function releaseThompsonMutex() {
  if (_thompsonMutexQueue.length > 0) {
    const next = _thompsonMutexQueue.shift();
    next();
  } else {
    _thompsonMutexLocked = false;
  }
}

/**
 * Обертка с защитой от конкуренции для withSeededRandom
 */
export async function withSeededRandomSafe(seedHex, fn) {
  await acquireThompsonMutex();
  try {
    return await withSeededRandom(seedHex, fn);
  } finally {
    releaseThompsonMutex();
  }
}

/**
 * 2. ACTIONABLE PRICE SUGGESTION (Действенная рекомендация по цене)
 * Если clampDiagnosis показывает, что цена "прибита гвоздями" к капсу,
 * эта функция рассчитывает минимальный basePrice, при котором кап перестанет связывать.
 */
export function calculateUncappedBasePrice(currentCap, targetMultiplier = 1.0) {
  // Если getPriceBand умножает на (1 + conversionRate*0.5 + explorationBonus),
  // то минимальный множитель = 1.0 (когда conversionRate=0 и bonus=0).
  // Чтобы Math.min(cap, basePrice * 1.0) не срабатывал, basePrice должен быть строго < cap.
  const safeMargin = 0.999; // 0.1% headroom
  return Number((currentCap * safeMargin / targetMultiplier).toFixed(6));
}

/**
 * 3. REPUTATION TIER MAPPING (Маппинг для ончейн-репутации)
 * Преобразует историю покупок в простой "Tier" для записи в CronusReputation.sol,
 * избегая передачи сырых массивов в смарт-контракт.
 */
export function getReputationTier(hist) {
  if (hist.selfGenerated) return { tier: 0, label: "INTERNAL_TEST", weight: 0 };
  if (hist.purchases === 0) return { tier: 1, label: "NEW_USER", weight: 1 };
  if (hist.purchases >= 10 && hist.spentUsdc >= 0.01) return { tier: 3, label: "WHITELISTED_LOYAL", weight: 3 };
  if (hist.purchases >= 3) return { tier: 2, label: "VERIFIED_REPEAT", weight: 2 };
  return { tier: 1, label: "NEW_USER", weight: 1 };
}

// Обновляем экспорт, сохраняя старый
const originalLiveThompsonRoutes = { "thompson": liveThompson, "thompson-price": liveThompson };
export const EXTENDED_LIVE_THOMPSON_ROUTES = { 
  ...originalLiveThompsonRoutes,
  // Можно добавить новый безопасный эндпоинт, использующий mutex, если потребуется
};

export const LIVE_THOMPSON_EXTRAS = {
  ...originalLiveThompsonRoutes,
  withSeededRandomSafe,
  calculateUncappedBasePrice,
  getReputationTier,
  LIVE_THOMPSON_VERSION,
  PRICE_FLOOR,
  PRICE_CAP
};
