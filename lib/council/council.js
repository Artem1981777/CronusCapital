// lib/council/council.js — Cronus Council (council-2). Настоящий совет, без моков.
// ADDITIVE: не изменяет lib/upgrades/councilConsensus.js.
// Отличия от заглушки:
//  1) голоса дают РЕАЛЬНЫЕ модели; нет ключей => нет голосов (никакой имитации);
//  2) роли расходятся ВХОДНЫМИ ДАННЫМИ, а не константой bias;
//  3) ELO обновляется против РЕАЛИЗОВАННОГО исхода, а не против мнения большинства
//     (награда за согласие с толпой = премия за стадность, это убрано);
//  4) нет NaN при нуле голосов.
import { availableProviders, callProvider } from "./providers.js"

export const COUNCIL_VERSION = "council-2"
export const VERDICTS = new Set(["BUY", "SELL", "SKIP"])

export const ROLES = [
  {
    id: "technical",
    brief: "You judge short-term momentum and trend structure only.",
    evidence: ["price", "changePct", "high24h", "low24h"],
  },
  {
    id: "fundamental",
    brief: "You judge participation and liquidity: volume and turnover relative to price.",
    evidence: ["price", "vol24h", "turnover24h"],
  },
  {
    id: "contrarian",
    brief: "You look for exhaustion: proximity to 24h extremes argues against the crowd.",
    evidence: ["price", "distFromHighPct", "distFromLowPct"],
  },
]

// pure: у каждой роли СВОЙ срез данных — источник настоящего расхождения
export function sliceEvidence(role, market) {
  const m = market || {}
  const out = {}
  for (const k of role.evidence) if (m[k] != null) out[k] = m[k]
  return out
}

// pure: производные метрики для contrarian, считаются из фактов, не выдумываются
export function enrichMarket(market) {
  const m = Object.assign({}, market || {})
  const p = Number(m.price)
  const hi = Number(m.high24h)
  const lo = Number(m.low24h)
  if (Number.isFinite(p) && p > 0) {
    if (Number.isFinite(hi) && hi > 0) m.distFromHighPct = Number((((hi - p) / hi) * 100).toFixed(3))
    if (Number.isFinite(lo) && lo > 0) m.distFromLowPct = Number((((p - lo) / lo) * 100).toFixed(3))
  }
  return m
}

export function systemPrompt(role) {
  return "You are the " + role.id + " member of a trading council. " + role.brief
    + " Answer ONLY with JSON: {\"verdict\":\"BUY|SELL|SKIP\",\"confidence\":0.0-1.0,"
    + "\"rationale\":\"one short sentence\"}."
    + " Use ONLY the evidence provided. Never invent or recall numbers not present."
}

export function userPrompt(topic, evidence) {
  return "instrument: " + String(topic) + "\nevidence: " + JSON.stringify(evidence)
}

// pure: терпимый парсер + строгая валидация. Мусор отбрасывается, а не «исправляется».
export function parseVote(text) {
  if (typeof text !== "string") return null
  let raw = null
  try { raw = JSON.parse(text) } catch (_) {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    try { raw = JSON.parse(m[0]) } catch (_) { return null }
  }
  if (!raw || typeof raw !== "object") return null
  const verdict = String(raw.verdict || "").toUpperCase().trim()
  if (!VERDICTS.has(verdict)) return null
  let c = Number(raw.confidence)
  if (!Number.isFinite(c)) return null
  // модели часто отвечают процентами (72 => 0.72). Правило однозначное и детерминированное:
  // 0..1 берём как есть, (1..100] считаем процентами, всё остальное отбрасываем.
  if (c > 1 && c <= 100) c = c / 100
  if (c < 0 || c > 1) return null
  return {
    verdict,
    confidence: Number(c.toFixed(4)),
    rationale: typeof raw.rationale === "string" ? raw.rationale.slice(0, 240) : "",
  }
}

// pure: распределение провайдеров по ролям. Режим — следствие реальности, не декларация.
export function assignProviders(available, roles) {
  const rs = roles || ROLES
  const av = Array.isArray(available) ? available.slice() : []
  if (av.length === 0) return { mode: "unavailable", assignments: [] }
  if (av.length >= rs.length) {
    return {
      mode: "multi-provider",
      assignments: rs.map((r, i) => ({ role: r.id, provider: av[i] })),
    }
  }
  return {
    mode: av.length === 1 ? "single-provider-three-role" : "mixed-provider",
    assignments: rs.map((r, i) => ({ role: r.id, provider: av[i % av.length] })),
  }
}

// pure: подсчёт консенсуса. Нет голосов => ABSTAIN и confidence:null, а не NaN.
export function tally(votes, opts) {
  const o = opts || {}
  const threshold = Number.isFinite(Number(o.threshold)) ? Number(o.threshold) : 2
  const valid = (votes || []).filter((v) => v && VERDICTS.has(v.verdict))
  if (valid.length < threshold) {
    return {
      consensus: "ABSTAIN", confidence: null, validVotes: valid.length,
      threshold, counts: {}, dissent: [], reason: "insufficient_votes",
    }
  }
  const counts = {}
  for (const v of valid) counts[v.verdict] = (counts[v.verdict] || 0) + 1
  let top = null
  for (const k of Object.keys(counts).sort()) {
    if (top === null || counts[k] > counts[top]) top = k
  }
  const consensus = counts[top] >= threshold ? top : "ABSTAIN"
  const agreeing = valid.filter((v) => v.verdict === consensus)
  const confidence = consensus === "ABSTAIN" || agreeing.length === 0 ? null
    : Number((agreeing.reduce((a, b) => a + b.confidence, 0) / agreeing.length).toFixed(4))
  return {
    consensus, confidence, validVotes: valid.length, threshold, counts,
    dissent: valid.filter((v) => v.verdict !== consensus).map((v) => v.role || v.provider),
    reason: consensus === "ABSTAIN" ? "no_majority" : "majority",
  }
}

// pure: ELO против РЕАЛЬНОСТИ. Согласие с большинством не вознаграждается.
export function eloUpdate(votes, realizedVerdict, opts) {
  const o = opts || {}
  const K = Number.isFinite(Number(o.k)) ? Number(o.k) : 32
  const ratings = o.ratings || {}
  if (!VERDICTS.has(String(realizedVerdict || "").toUpperCase())) {
    return { applied: false, reason: "unresolved_outcome", delta: {}, ratings }
  }
  const realized = String(realizedVerdict).toUpperCase()
  const delta = {}
  const next = Object.assign({}, ratings)
  for (const v of votes || []) {
    if (!v || !VERDICTS.has(v.verdict)) continue
    const id = v.role || v.provider
    const expected = Number.isFinite(Number(v.confidence)) ? Number(v.confidence) : 0.5
    const actual = v.verdict === realized ? 1 : 0
    const d = Number((K * (actual - expected)).toFixed(3))
    delta[id] = d
    next[id] = Number(((next[id] == null ? 1200 : next[id]) + d).toFixed(3))
  }
  return { applied: true, reason: "resolved", realized, delta, ratings: next }
}

// единственный async-вход. Нет ключей => нет голосования. Никаких синтетических голосов.
// Режим по факту голосования: заявлять mixed-provider, когда зачлись голоса
// одного провайдера, значит выдавать желаемое за действительное.
export function effectiveMode(plannedMode, votes) {
  const distinct = Array.from(new Set((votes || []).map((v) => v && v.provider).filter(Boolean)))
  if (distinct.length === 0) return "no-valid-votes"
  if (distinct.length === 1) return plannedMode === "single-provider-three-role" ? plannedMode : "single-provider-effective"
  return plannedMode
}

export async function runCouncil(args) {
  const a = args || {}
  const o = a.opts || {}
  const env = o.env || process.env
  const roles = a.roles || ROLES
  const available = o.available || availableProviders(env)
  const plan = assignProviders(available, roles)

  if (plan.mode === "unavailable") {
    return Object.freeze({
      ok: false, version: COUNCIL_VERSION, mode: "unavailable",
      reason: "no_llm_keys", providers: [], providersAttempted: [], providersFailed: [], consensus: "ABSTAIN",
      confidence: null, votes: [], errors: [], synthetic: false,
    })
  }

  const market = enrichMarket(a.market)
  const results = await Promise.all(plan.assignments.map(async (asg) => {
    const role = roles.find((r) => r.id === asg.role)
    const ev = sliceEvidence(role, market)
    const res = await callProvider(asg.provider, systemPrompt(role), userPrompt(a.topic, ev), {
      env, fetchImpl: o.fetchImpl, temperature: o.temperature == null ? 0 : o.temperature,
      seed: o.seed, model: o.models && o.models[asg.provider],
    })
    if (!res.ok) return { role: role.id, provider: asg.provider, error: res.error }
    const vote = parseVote(res.text)
    if (!vote) return { role: role.id, provider: asg.provider, error: "unparseable_vote" }
    return Object.assign({ role: role.id, provider: asg.provider, model: res.model, evidence: ev }, vote)
  }))

  // Переголосование роли у живого провайдера. Объявленный, но нерабочий ключ
  // (например ANTHROPIC_API_KEY без реального доступа) не должен лишать совет
  // голоса: роль опрашивается заново у того, кто отвечает. Факт переключения
  // фиксируется в поле failover и не скрывается.
  const failover = []
  if (o.failover !== false) {
    const planned = Array.from(new Set(plan.assignments.map((x) => x.provider)))
    for (let i = 0; i < results.length; i += 1) {
      const r = results[i]
      if (!r.error) continue
      const role = roles.find((x) => x.id === r.role)
      if (!role) continue
      const working = Array.from(new Set(results.filter((x) => !x.error).map((x) => x.provider)))
      const candidates = Array.from(new Set(working.concat(planned))).filter((p) => p !== r.provider)
      for (const provider of candidates) {
        const ev = sliceEvidence(role, market)
        const res = await callProvider(provider, systemPrompt(role), userPrompt(a.topic, ev), {
          env, fetchImpl: o.fetchImpl, temperature: o.temperature == null ? 0 : o.temperature,
          seed: o.seed, model: o.models && o.models[provider],
        })
        if (!res.ok) continue
        const vote = parseVote(res.text)
        if (!vote) continue
        failover.push({ role: r.role, from: r.provider, to: provider, reason: r.error })
        results[i] = Object.assign({ role: role.id, provider, model: res.model, evidence: ev }, vote)
        break
      }
    }
  }

  const votes = results.filter((r) => !r.error)
  const errors = results.filter((r) => r.error).map((r) => ({ role: r.role, provider: r.provider, error: r.error }))
  const t = tally(votes, { threshold: o.threshold })

  return Object.freeze({
    ok: votes.length > 0,
    version: COUNCIL_VERSION,
    mode: effectiveMode(plan.mode, votes),
    modePlanned: plan.mode,
    providers: Array.from(new Set(votes.map((v) => v.provider))),
    providersAttempted: Array.from(new Set(plan.assignments.map((x) => x.provider))),
    providersFailed: Array.from(new Set(errors.map((e) => e.provider))),
    consensus: t.consensus,
    confidence: t.confidence,
    validVotes: t.validVotes,
    counts: t.counts,
    dissent: t.dissent,
    reason: t.reason,
    votes,
    errors,
    failover,
    synthetic: false,
  })
}

export default {
  runCouncil, tally, eloUpdate, parseVote, assignProviders, effectiveMode,
  sliceEvidence, enrichMarket, ROLES, COUNCIL_VERSION,
}
