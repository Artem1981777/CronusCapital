// lib/council/providers.js — адаптеры LLM-провайдеров с единым интерфейсом.
// ADDITIVE: новый модуль, ничего существующего не импортирует и не меняет.
// Транспорт инжектируемый (fetchImpl) => совет тестируется офлайн, без ключей.

export const PROVIDERS = {
  groq: {
    id: "groq",
    envKey: "GROQ_API_KEY",
    model: "llama-3.3-70b-versatile",
    url: "https://api.groq.com/openai/v1/chat/completions",
    build(sys, user, o) {
      return {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + o.key },
        body: JSON.stringify({
          model: o.model, temperature: o.temperature,
          seed: o.seed == null ? undefined : o.seed,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        }),
      }
    },
    parse(j) {
      return j && j.choices && j.choices[0] && j.choices[0].message
        ? j.choices[0].message.content : null
    },
  },
  deepseek: {
    id: "deepseek",
    envKey: "DEEPSEEK_API_KEY",
    model: "deepseek-chat",
    url: "https://api.deepseek.com/chat/completions",
    build(sys, user, o) {
      return {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + o.key },
        body: JSON.stringify({
          model: o.model, temperature: o.temperature,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        }),
      }
    },
    parse(j) {
      return j && j.choices && j.choices[0] && j.choices[0].message
        ? j.choices[0].message.content : null
    },
  },
  anthropic: {
    id: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    model: "claude-3-5-sonnet-latest",
    url: "https://api.anthropic.com/v1/messages",
    build(sys, user, o) {
      return {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": o.key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: o.model, max_tokens: 512, temperature: o.temperature,
          system: sys, messages: [{ role: "user", content: user }],
        }),
      }
    },
    parse(j) {
      return j && Array.isArray(j.content) && j.content[0] ? j.content[0].text : null
    },
  },
}

// Какие провайдеры реально доступны СЕЙЧАС. Никаких допущений о ключах.
export function availableProviders(env) {
  const e = env || process.env
  return Object.values(PROVIDERS)
    .filter((p) => typeof e[p.envKey] === "string" && e[p.envKey].trim() !== "")
    .map((p) => p.id)
}

export async function callProvider(id, sys, user, opts) {
  const o = opts || {}
  const p = PROVIDERS[id]
  if (!p) return { ok: false, provider: id, error: "unknown_provider" }
  const env = o.env || process.env
  const key = env[p.envKey]
  if (!key) return { ok: false, provider: id, error: "missing_key" }
  const model = o.model || p.model
  const init = p.build(sys, user, {
    key, model,
    temperature: o.temperature == null ? 0 : o.temperature,
    seed: o.seed,
  })
  const f = o.fetchImpl || fetch
  try {
    const r = await f(p.url, init)
    const j = await r.json()
    const text = p.parse(j)
    if (!text) return { ok: false, provider: id, model, error: "empty_response" }
    return { ok: true, provider: id, model, text }
  } catch (e) {
    return { ok: false, provider: id, model, error: String((e && e.message) || e) }
  }
}

export default { PROVIDERS, availableProviders, callProvider }
