// lib/creatorRegistry.js — CREATOR_LAYER: allow-listed creator payout registry.
// Pure, zero-dependency, additive, and OFF by default. Sits ON TOP of the
// existing basis-point split engine (lib/splitPay.js) without touching it: this
// module only DECIDES a creator split (allow-list + bps math). It never signs,
// never burns, never moves funds. Gated behind CREATOR_LAYER so it is fully
// inert unless a workspace explicitly opts in.
//
// Honesty note: nothing here fabricates demand or payouts. It is a deterministic
// allocator a caller MAY later wire into the signed split path — behind an
// explicit flag — once real creators exist.
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/

// Is the creator layer switched on? Default: OFF.
export function creatorLayerEnabled(env) {
  const e = env || (typeof process !== "undefined" ? process.env : {})
  const v = String((e && e.CREATOR_LAYER) || "").trim().toLowerCase()
  return v === "on" || v === "1" || v === "true" || v === "yes"
}

// pure: parse a registry (JSON string or array) into normalized creators.
// Each valid entry -> { id, address, bps }. Invalid/dupe entries are dropped.
export function parseRegistry(raw) {
  let arr = raw
  if (typeof raw === "string") { try { arr = JSON.parse(raw) } catch (_) { return [] } }
  if (!Array.isArray(arr)) return []
  const seen = new Set()
  const out = []
  for (const r of arr) {
    if (!r) continue
    const address = String(r.address || r.to || "").trim()
    if (!ADDR_RE.test(address)) continue
    const key = address.toLowerCase()
    if (seen.has(key)) continue
    const bps = Math.floor(Number(r.bps || 0))
    if (!isFinite(bps) || bps <= 0) continue
    seen.add(key)
    out.push({ id: r.id != null ? String(r.id) : key, address: address, bps: bps })
  }
  return out
}

export function totalBps(creators) {
  return (creators || []).reduce((a, c) => a + (c.bps || 0), 0)
}

// pure deterministic allocation — mirrors lib/splitPay.js allocate(): integer
// bps math, LAST creator absorbs the rounding remainder (no dust is lost).
export function allocate(totalAtomic, creators) {
  const total = BigInt(totalAtomic || "0")
  const sumBps = BigInt(totalBps(creators) || 1)
  const allocs = []
  let assigned = 0n
  for (let i = 0; i < creators.length; i++) {
    let share
    if (i === creators.length - 1) share = total - assigned
    else { share = (total * BigInt(creators[i].bps)) / sumBps; assigned += share }
    allocs.push({ id: creators[i].id, address: creators[i].address, bps: creators[i].bps, amountAtomic: String(share) })
  }
  return allocs
}

// pure guard: every requested payout address MUST be a registered creator.
// Returns { ok, unknown:[...] }. Defends against paying an unlisted address.
export function assertAllowListed(recipients, registry) {
  const allow = new Set(parseRegistry(registry).map((c) => c.address.toLowerCase()))
  const unknown = []
  for (const r of recipients || []) {
    const a = String((r && (r.address || r.to)) || r || "").trim().toLowerCase()
    if (!allow.has(a)) unknown.push(a)
  }
  return { ok: unknown.length === 0, unknown: unknown }
}

// top-level decision. NEVER signs or moves funds — returns an allocation plan.
export function resolveCreatorSplit(args) {
  const a = args || {}
  if (!creatorLayerEnabled(a.env)) return { enabled: false, action: "disabled", reason: "CREATOR_LAYER off", allocations: [] }
  const creators = parseRegistry(a.registry)
  if (creators.length === 0) return { enabled: true, action: "hold", reason: "empty creator registry", allocations: [] }
  const sum = totalBps(creators)
  if (sum !== 10000) return { enabled: true, action: "reject", reason: "creator bps must sum to 10000, got " + sum, allocations: [] }
  const total = BigInt(a.totalAtomic || "0")
  if (total <= 0n) return { enabled: true, action: "reject", reason: "amount must be > 0", allocations: [] }
  return { enabled: true, action: "split", totalAtomic: String(total), totalBps: sum, recipientCount: creators.length, allocations: allocate(String(total), creators) }
}
