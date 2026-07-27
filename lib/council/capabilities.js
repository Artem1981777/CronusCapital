// Машиночитаемое описание НОВЫХ маршрутов (caps-1).
// Старый /api/info?kind=openapi не изменяется: он описывает исходные 11 путей.
// Этот маршрут дополняет его и объясняет судье семантику ok/dataProvenance/refusal.
export const CAPABILITIES_VERSION = "caps-1"

export const ENDPOINTS = [
  { path: "/api/council", kind: "council", aliases: ["council-consensus"],
    what: "Совет из трёх ролей (technical/fundamental/contrarian) на реальных LLM, кворум 2 из 3.",
    params: { topic: "тема, свободный текст", instId: "инструмент OKX, по умолчанию BTC-USDC" },
    returns: ["consensus", "confidence", "validVotes", "counts", "dissent", "votes[].model", "providers", "providersAttempted", "providersFailed", "errors", "failover"],
    refusals: ["no_llm_keys", "market_unavailable"],
    honesty: "providers перечисляет только зачтённые голоса; опрошенные и упавшие провайдеры лежат в providersAttempted/providersFailed. Если провайдер роли недоступен, роль переспрашивается у живого провайдера, и это фиксируется в failover." },
  { path: "/api/kelly", kind: "kelly", aliases: ["kelly-stake"],
    what: "Размер ставки по критерию Келли на реальном трек-рекорде из стейк-леджера.",
    params: { acceptSmallSample: "1 — принять выборку меньше KELLY_MIN_GRADED", bankroll: "необязательный банкролл" },
    returns: ["stake", "kellyData", "conviction", "expectedValue", "capped"],
    refusals: ["ledger_unreachable", "empty_ledger", "insufficient_sample", "confidence_invalid", "market_unavailable", "no_llm_keys"],
    honesty: "hits/graded берутся из kv:cronus:stakes:ledger. Подстановки значений по умолчанию нет: при малой выборке маршрут отказывает." },
  { path: "/api/thompson", kind: "thompson", aliases: ["thompson-price"],
    what: "Цена по Thompson sampling на реальных покупках из чеков x402.",
    params: { payer: "адрес плательщика", successRate: "предположение о конверсии", acceptUnobserved: "1 — принять непронаблюдённую конверсию" },
    returns: ["priceUsdc", "history", "posterior", "clampDiagnosis", "priceDependsOnObservations", "determinism", "assumptions"],
    refusals: ["payer_required", "no_receipts", "cold_start_no_purchase_history", "no_conversion_observations", "receipts_unreachable"],
    honesty: "clampDiagnosis доказывает, что итоговая цена зажата потолком и не зависит от наблюдений. successRate помечен как assumption_not_observation." },
  { path: "/api/passport", kind: "passport", aliases: ["strategy-passport"],
    what: "Паспорт стратегии на живом вердикте совета с пересчётом хеша записи трассы.",
    params: { instId: "инструмент OKX" },
    returns: ["passport", "validation", "integrityRecheck", "hashFormatCheck", "legacyIntegrityCheck", "traceRecord", "council"],
    refusals: ["market_unavailable", "no_llm_keys", "council_unavailable"],
    honesty: "Целостность подтверждается пересчётом sha256 в integrityRecheck. Поле validation.integrity — устаревшая проверка длины 66 символов, структурно невыполнимая при формате sha256:<64 hex>." },
  { path: "/api/shadow-float", kind: "shadow-float", aliases: [],
    what: "Описание кредитных линий ShadowFloat.",
    params: {}, returns: ["features", "note"], refusals: [],
    honesty: "descriptive_only: маршрут описывает возможности, а не исполняет их. dataProvenance.synthetic = true." },
  { path: "/api/use-receipt", kind: "use-receipt", aliases: ["use-registry"],
    what: "Описание реестра use-receipt (anchor/settle).",
    params: {}, returns: ["actions", "features", "note"], refusals: [],
    honesty: "descriptive_only: dataProvenance.synthetic = true." },
  { path: "/api/capabilities", kind: "capabilities", aliases: [],
    what: "Этот документ.", params: {}, returns: ["endpoints", "contract"], refusals: [],
    honesty: "descriptive_only." },
]

export const CONTRACT = {
  ok: "boolean в каждом ответе: успех либо обоснованный отказ.",
  kind: "строковый идентификатор маршрута.",
  reason: "машиночитаемая причина отказа, присутствует при ok=false.",
  "dataProvenance.synthetic": "true — данные описательные/сгенерированные; false — получены из реального источника.",
  "dataProvenance.refusal": "true — ответ является отказом, значения не подставлены.",
  "dataProvenance.source": "конкретный источник входных данных.",
  principle: "Отсутствие данных приводит к отказу, а не к значению по умолчанию.",
}

export default async function capabilities(req, res) {
  return res.status(200).json({
    ok: true,
    kind: "capabilities",
    version: CAPABILITIES_VERSION,
    note: "Дополняет /api/info?kind=openapi: описывает маршруты, добавленные поверх исходного API.",
    endpointCount: ENDPOINTS.length,
    endpoints: ENDPOINTS,
    contract: CONTRACT,
    dataProvenance: {
      version: CAPABILITIES_VERSION, synthetic: true, live: false,
      source: "lib/council/capabilities.js (статическое описание маршрутов)",
      computation: "descriptive_only",
      note: "Документ описывает поведение маршрутов и сам не обращается к данным.",
    },
  })
}
