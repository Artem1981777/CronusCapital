// lib/traceArchive.js — content-addressed archive of Cronus reasoning traces + verify.
// Each trace is addressed by sha256 of its CANONICAL {input, output}. Re-hashing the stored
// record must reproduce the address -> any tampering changes the hash (tamper-evident). Paired
// with deterministic runs (temperature 0 + fixed seed) so anyone can re-execute the same inputs
// and reproduce the same trace. Pure helpers are unit-tested; KV I/O is isolated and fail-open.
// Routed publicly as /api/trace via vercel.json -> /api/info?kind=trace.
import { createHash } from "node:crypto"

// pure: deterministic JSON with sorted keys (stable across key insertion order).
export function canonicalize(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v)
  if (Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]"
  const keys = Object.keys(v).sort()
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(v[k])).join(",") + "}"
}

// pure: sha256 content address of a record ("sha256:" + hex).
export function contentHash(record) {
  return "sha256:" + createHash("sha256").update(canonicalize(record)).digest("hex")
}

// pure: normalize a consult run into the canonical record we hash + archive.
export function buildTraceRecord(input, output) {
  const i = input || {}, o = output || {}
  const num = (x) => (x == null || !isFinite(Number(x)) ? null : Number(x))
  return {
    v: 1,
    input: {
      model: i.model || null,
      seed: i.seed === undefined ? null : i.seed,
      temperature: i.temperature === undefined ? null : i.temperature,
      topic: i.topic || null,
      instId: i.instId || null,
      price: num(i.price),
      changePct: num(i.changePct),
      high24h: num(i.high24h),
      low24h: num(i.low24h),
      vol24h: num(i.vol24h),
    },
    output: {
      verdict: o.verdict || "SKIP",
      conviction: o.conviction == null ? 0 : o.conviction,
      trace: Array.isArray(o.trace) ? o.trace : [],
      analog: o.analog || null,
      decisions: Array.isArray(o.decisions) ? o.decisions : [],
    },
  }
}

// pure: recompute the address and compare to a claimed hash.
export function verifyRecord(record, claimedHash) {
  const h = contentHash(record)
  return { hash: h, matches: typeof claimedHash === "string" ? h === claimedHash : null }
}

// pure: attach auditable pay-to-think COGS to a trace record (only when purchases exist).
// Simulated (dry-run) purchases carry txRef:null and are deterministic -> the record stays
// content-addressed + re-verifiable. Settled purchases keep their real on-chain txRef.
export function withCogs(record, cogs) {
  if (!record || !cogs || typeof cogs !== "object") return record
  const pays = Array.isArray(cogs.upstream_payments) ? cogs.upstream_payments : []
  if (!pays.length) return record
  return {
    ...record,
    cogs: {
      cogs_atomic: Math.floor(Number(cogs.cogs_atomic) || 0),
      upstream_payments: pays.map((p) => ({
        sourceId: (p && p.sourceId) || null,
        priceUsdAtomic: Math.floor(Number(p && p.priceUsdAtomic) || 0),
        recipient: (p && p.recipient) || null,
        mode: (p && p.mode) || "simulated",
        txRef: p && p.mode === "settled" ? (p.txRef || null) : null,
      })),
    },
  }
}

async function kv(cmd) {
  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return null
  try {
    const r = await fetch(base, { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(cmd) })
    const j = await r.json()
    return j && j.result
  } catch (_) {
    return null
  }
}

// fail-open: store by content hash + push to a capped recent index. Returns the hash.
export async function archiveTrace(record) {
  const hash = contentHash(record)
  const payload = JSON.stringify({ hash, record, archivedAt: new Date().toISOString() })
  await kv(["SET", "cronus:trace:" + hash, payload])
  await kv(["LPUSH", "cronus:trace:recent", hash])
  await kv(["LTRIM", "cronus:trace:recent", "0", "199"])
  return hash
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120")
  try {
    const hash = req.query && req.query.hash ? String(req.query.hash) : null
    if (hash) {
      const raw = await kv(["GET", "cronus:trace:" + hash])
      if (!raw) { res.status(404).json({ ok: false, error: "trace not found", hash }); return }
      let stored = null
      try { stored = typeof raw === "string" ? JSON.parse(raw) : raw } catch (_) { stored = null }
      if (!stored || !stored.record) { res.status(502).json({ ok: false, error: "corrupt trace record", hash }); return }
      const recomputed = contentHash(stored.record)
      res.status(200).json({
        ok: true,
        name: "Cronus Capital — content-addressed reasoning trace",
        principle: "Each reasoning trace is addressed by the sha256 of its canonical {input, output}. Re-hashing the stored record must reproduce the address; any tampering changes the hash. Deterministic runs (temperature 0 + fixed seed) let anyone re-execute the same inputs and reproduce the same trace.",
        hash,
        verified: recomputed === hash,
        recomputedHash: recomputed,
        archivedAt: stored.archivedAt || null,
        record: stored.record,
        updatedAt: new Date().toISOString(),
      })
      return
    }
    const recent = await kv(["LRANGE", "cronus:trace:recent", "0", "49"])
    res.status(200).json({
      ok: true,
      name: "Cronus Capital — content-addressed reasoning archive",
      principle: "Reasoning traces are content-addressed by sha256 of their canonical {input, output}. GET /api/trace?hash=<hash> returns a trace and re-verifies its address.",
      count: Array.isArray(recent) ? recent.length : 0,
      recent: Array.isArray(recent) ? recent : [],
      hint: "GET /api/trace?hash=sha256:... to fetch and re-verify a specific trace",
      updatedAt: new Date().toISOString(),
    })
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e && e.message) || e) })
  }
}
