// lib/provenance/livePassport.js — настоящий Strategy Passport (livep-1). ADDITIVE.
// lib/upgrades/strategyPassport.js НЕ редактируется: используются его же
// createStrategyPassport() и validatePassport(), но с реальным решением на входе.
//
// Устраняемый косяк: verifyIntegrity() требует traceHash.length === 66,
// а contentHash() отдаёт "sha256:" + 64 hex = 71 символ. Проверка не может
// стать true никогда. Здесь целостность проверяется ПЕРЕСЧЁТОМ хеша.
import { runCouncil } from "../council/council.js"
import { fetchMarket } from "../council/handler.js"
import { crossCheck } from "../priceSources.js"
import { buildTraceRecord, contentHash } from "../traceArchive.js"
import { createStrategyPassport, validatePassport } from "../upgrades/strategyPassport.js"
import { decorate } from "./wrap.js"

export const LIVE_PASSPORT_VERSION = "livep-1"

// pure: настоящая проверка целостности — пересчёт хеша по записи трассы
export function verifyPassportAgainstRecord(passport, record) {
  const claimed = passport && passport.verification && passport.verification.traceHash
  if (!claimed) return { ok: false, method: "recomputed_content_hash", reason: "trace_hash_missing" }
  let recomputed = null
  try { recomputed = contentHash(record) } catch (e) {
    return { ok: false, method: "recomputed_content_hash", reason: "hash_failed", error: String((e && e.message) || e) }
  }
  return {
    ok: recomputed === claimed,
    method: "recomputed_content_hash",
    reason: recomputed === claimed ? "hash_matches_record" : "hash_mismatch",
    claimed, recomputed, algorithm: "sha256", format: "sha256:<64 hex>",
  }
}

// pure: объясняет, почему встроенная проверка всегда false
export function legacyIntegrityDiagnosis(passport) {
  const h = passport && passport.verification && passport.verification.traceHash
  const len = typeof h === "string" ? h.length : null
  return {
    ok: len === 66,
    check: "passport.verification.traceHash.length === 66",
    actualLength: len,
    expectedLength: 66,
    reason: len === 66 ? "length_matches" : "length_check_incompatible_with_content_hash_format",
    explanation: "contentHash() возвращает 'sha256:' + 64 hex (71 символ). Проверка длины 66 "
      + "рассчитана на формат '0x' + 64 hex и не может быть выполнена в этом репозитории. "
      + "Целостность подтверждается полем integrityRecheck (пересчёт хеша).",
  }
}

const refuse = (res, body) => res.status(200).json(Object.assign({
  ok: false, kind: "strategy-passport", version: LIVE_PASSPORT_VERSION, synthetic: false,
}, body))

export function makeLivePassport(opts) {
  const o = opts || {}
  return async function livePassport(req, res) {
    if (res && res.setHeader) res.setHeader("Access-Control-Allow-Origin", "*")
    const q = (req && req.query) || {}
    const env = o.env || process.env
    const instId = String(q.instId || q.topic || "BTC-USDC").toUpperCase()

    let market = null
    try { market = await fetchMarket(instId, o.fetchImpl) } catch (_) { market = null }
    if (!market || market.price == null) return refuse(res, { reason: "market_unavailable", instId })

    // кросс-проверка цены существующим модулем (он fail-open, поэтому оборачиваем)
    let xc = null
    try { xc = await crossCheck(instId, market.price, o.crossCheckOpts || {}) } catch (_) { xc = null }

    const council = await runCouncil({ topic: instId, market, opts: { env, fetchImpl: o.fetchImpl } })
    if (!council.ok || council.confidence == null) {
      return refuse(res, {
        reason: council.reason || "council_unavailable", instId, councilMode: council.mode,
        note: "Паспорт не выпущен: настоящего решения нет. Демонстрационное решение не подставляется.",
      })
    }

    const record = buildTraceRecord({
      model: (council.votes[0] && council.votes[0].model) || null,
      seed: o.seed == null ? null : o.seed,
      temperature: 0,
      topic: instId, instId,
      price: market.price, changePct: market.changePct,
      high24h: market.high24h, low24h: market.low24h, vol24h: market.vol24h,
    }, {
      verdict: council.consensus,
      conviction: council.confidence,
      trace: council.votes.map((v) => v.role + ":" + v.verdict + "@" + v.confidence),
      analog: null,
      decisions: [],
    })
    const traceHash = contentHash(record)

    const revenue = Number(env.SIGNAL_PRICE)
    const decision = {
      type: "signal",
      verdict: council.consensus,
      confidence: council.confidence,
      timestamp: Date.now(),
      marketData: market,
      oracles: xc ? ["okx", xc.source] : ["okx"],
      crossChecks: xc ? [xc] : [],
      trace: record.output.trace,
      model: (council.votes[0] && council.votes[0].model) || null,
      temperature: 0,
      deterministic: true,
      revenue: Number.isFinite(revenue) ? revenue : 0,
      conviction: council.confidence,
      traceHash,
    }

    const passport = createStrategyPassport(decision)
    const validation = validatePassport(passport)
    const body = {
      ok: true,
      kind: "strategy-passport",
      version: LIVE_PASSPORT_VERSION,
      instId,
      passport,
      validation,
      integrityRecheck: verifyPassportAgainstRecord(passport, record),
      legacyIntegrityCheck: legacyIntegrityDiagnosis(passport),
      traceRecord: record,
      council: {
        mode: council.mode, consensus: council.consensus, confidence: council.confidence,
        validVotes: council.validVotes, dissent: council.dissent, providers: council.providers,
      },
      economicsSource: Number.isFinite(revenue)
        ? "SIGNAL_PRICE из конфигурации"
        : "не измерено: SIGNAL_PRICE не задан, revenue выставлен в 0, а не выдуман",
    }
    const decorated = decorate(body, {
      synthetic: false,
      source: "lib/upgrades/strategyPassport.js (реальное решение council-2 на входе)",
      endpointKind: "strategy-passport",
      computation: "real_schema_plus_recomputed_hash",
      inputs: "котировки OKX, кросс-проверка " + (xc ? xc.source : "недоступна") + ", вердикт совета " + council.mode,
      note: "Демонстрационное решение не используется. Целостность подтверждается пересчётом "
        + "sha256 по записи трассы; встроенная проверка длины 66 несовместима с форматом "
        + "contentHash() и всегда даёт false — см. legacyIntegrityCheck.",
    })
    // decorate() проверяет только ФОРМАТ хеша и перетирал бы сильную проверку.
    // Пересчёт хеша строго сильнее: он и остаётся в integrityRecheck.
    decorated.hashFormatCheck = decorated.integrityRecheck
    decorated.integrityRecheck = body.integrityRecheck
    return res.status(200).json(decorated)
  }
}

const livePassport = makeLivePassport()
export const LIVE_PASSPORT_ROUTES = { "passport": livePassport, "strategy-passport": livePassport }
export default LIVE_PASSPORT_ROUTES
