// lib/provenance/wrap.js — честная маркировка происхождения данных (prov-1). ADDITIVE.
// Старые обработчики вызываются БЕЗ ИЗМЕНЕНИЙ: их ответ перехватывается прокси-res
// и дополняется dataProvenance. Ни один файл в lib/upgrades/ не редактируется.
export const PROVENANCE_VERSION = "prov-1"

const HEX64 = /^[0-9a-f]{64}$/i

// pure: contentHash() из lib/traceArchive.js даёт 64 hex без 0x.
// Заглушка требует length === 66 => integrity всегда false. Здесь принимаем оба вида.
export function normalizeHash(h) {
  if (typeof h !== "string") return null
  const s = h.trim().toLowerCase()
  const bare = s.startsWith("0x") ? s.slice(2) : s
  return HEX64.test(bare) ? "0x" + bare : null
}

export function recheckIntegrity(passport) {
  const p = passport || {}
  const v = p.verification || {}
  const raw = v.traceHash || p.traceHash || null
  const norm = normalizeHash(raw)
  if (!norm) return { ok: false, reason: raw ? "malformed_trace_hash" : "trace_hash_missing", raw }
  return { ok: true, reason: "hash_wellformed", raw, normalized: norm, bits: 256 }
}

// pure: находит паспорт в ответе, не зная заранее его точной формы
export function locatePassport(body) {
  if (!body || typeof body !== "object") return null
  if (body.passport && typeof body.passport === "object") return body.passport
  if (body.verification && typeof body.verification === "object") return body
  if (body.data && typeof body.data === "object" && body.data.verification) return body.data
  return null
}

// pure: не мутирует вход
export function decorate(body, meta) {
  const m = meta || {}
  if (body == null || typeof body !== "object") {
    return { value: body, dataProvenance: provenanceOf(m) }
  }
  const out = Array.isArray(body) ? { items: body.slice() } : Object.assign({}, body)
  out.dataProvenance = provenanceOf(m)
  const p = locatePassport(out)
  if (p) out.integrityRecheck = recheckIntegrity(p)
  return out
}

function provenanceOf(m) {
  return {
    version: PROVENANCE_VERSION,
    synthetic: m.synthetic === true,
    live: m.synthetic !== true,
    source: m.source || "unknown",
    inputs: m.inputs || (m.synthetic === true ? "hardcoded_demo_values" : "runtime"),
    computation: m.computation || "unspecified",
    endpointKind: m.endpointKind || null,
    note: m.note || (m.synthetic === true
      ? "Демонстрационные входные данные. Не является торговой рекомендацией и не отражает реальную позицию."
      : "Входные данные получены во время исполнения."),
  }
}

// перехват ответа старого обработчика через прокси-res
export function wrapHandler(inner, metaOrFn) {
  return async function wrapped(req, res) {
    // meta может зависеть от запроса: живые параметры => не synthetic
    const meta = typeof metaOrFn === "function" ? metaOrFn(req) : metaOrFn
    let code = 200
    let captured = undefined
    let captureMode = "none"
    const proxy = {
      setHeader(...a) { if (res && res.setHeader) res.setHeader(...a) },
      getHeader(...a) { return res && res.getHeader ? res.getHeader(...a) : undefined },
      status(c) { code = c; return proxy },
      json(b) { captured = b; captureMode = "json"; return proxy },
      send(b) { captured = b; captureMode = "send"; return proxy },
      end(b) { if (captureMode === "none") { captured = b; captureMode = "end" } return proxy },
    }
    try {
      await inner(req, proxy)
    } catch (e) {
      return res.status(500).json({
        ok: false, error: "upstream_handler_failed",
        message: String((e && e.message) || e),
        dataProvenance: provenanceOf(meta || {}),
      })
    }
    if (captureMode === "json" || (captured && typeof captured === "object")) {
      return res.status(code).json(decorate(captured, meta))
    }
    return res.status(code).json(decorate(
      { raw: captured === undefined ? null : String(captured) }, meta,
    ))
  }
}

export default { wrapHandler, decorate, recheckIntegrity, normalizeHash, locatePassport, PROVENANCE_VERSION }
