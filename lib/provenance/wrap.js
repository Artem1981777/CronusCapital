// lib/provenance/wrap.js - honest labeling of data provenance (prov-1). ADDITIVE.
// The old handlers are called UNCHANGED: their response is intercepted by a proxy res
// and enriched with dataProvenance. No file in lib/upgrades/ is edited.
export const PROVENANCE_VERSION = "prov-1"

const HEX64 = /^[0-9a-f]{64}$/i

// pure: contentHash() in lib/traceArchive.js returns 64 hex characters without 0x.
// The stub demands length === 66 => integrity is always false. Here both forms are accepted.
export function normalizeHash(h) {
  if (typeof h !== "string") return null
  const s = h.trim().toLowerCase()
  // contentHash() in lib/traceArchive.js returns "sha256:" + 64 hex = 71 characters.
  // The length === 66 check in lib/upgrades/strategyPassport.js can never be satisfied.
  if (s.startsWith("sha256:")) {
    const b = s.slice(7)
    return HEX64.test(b) ? "sha256:" + b : null
  }
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

// pure: locates the passport in a response without knowing its exact shape in advance
export function locatePassport(body) {
  if (!body || typeof body !== "object") return null
  if (body.passport && typeof body.passport === "object") return body.passport
  if (body.verification && typeof body.verification === "object") return body
  if (body.data && typeof body.data === "object" && body.data.verification) return body.data
  return null
}

// pure: does not mutate its input
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
      ? "Demo inputs. This is not trading advice and does not reflect a real position."
      : "Inputs were obtained at runtime."),
  }
}

// intercepting the old handler's response through a proxy res
export function wrapHandler(inner, metaOrFn) {
  return async function wrapped(req, res) {
    // meta may depend on the request: live parameters => not synthetic
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

// === One response contract for every route (contract-1) ===
// Guarantees that EVERY route returns ok and dataProvenance, and that an exception
// inside a handler does not turn into an unexplained 500.
export function ensureContract(handler, meta) {
  const m = meta || {}
  return async function contracted(req, res) {
    let code = 200
    let payload = null
    let crashed = null
    const proxy = {
      setHeader(...a) { if (res && res.setHeader) res.setHeader(...a) },
      status(c) { code = Number(c) || 200; return proxy },
      json(j) { payload = j; return j },
      end() { return undefined },
    }
    try {
      await handler(req, proxy)
    } catch (e) {
      crashed = String((e && e.message) || e)
    }
    if (crashed) {
      return res.status(200).json({
        ok: false,
        kind: m.kind || "unknown",
        reason: "handler_failed",
        error: crashed,
        dataProvenance: {
          version: "contract-1", synthetic: false, live: false, refusal: true,
          source: "handler " + (m.kind || "unknown") + " threw an exception",
          note: "No values are substituted: the response is marked unsuccessful rather than filled with guesses.",
        },
      })
    }
    const body = (payload && typeof payload === "object") ? payload : { value: payload }
    if (typeof body.ok !== "boolean") body.ok = code < 400
    if (typeof body.kind !== "string" && m.kind) body.kind = m.kind
    if (!body.dataProvenance || typeof body.dataProvenance !== "object") {
      body.dataProvenance = {
        version: "contract-1",
        synthetic: false,
        live: body.ok === true,
        refusal: body.ok === false,
        source: m.kind ? "route " + m.kind : "cronus",
        note: body.ok === false
          ? "Refusal: the required data is absent. No defaults are substituted."
          : "The handler did not label provenance.",
      }
    } else if (typeof body.dataProvenance.synthetic !== "boolean") {
      body.dataProvenance.synthetic = false
    }
    if (body.ok === false && body.dataProvenance.refusal !== true) body.dataProvenance.refusal = true
    return res.status(code).json(body)
  }
}

export function mapContract(routes) {
  const out = {}
  for (const k of Object.keys(routes || {})) out[k] = ensureContract(routes[k], { kind: k })
  return out
}
