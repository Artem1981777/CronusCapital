import { test } from "node:test"
import assert from "node:assert/strict"

// Pure model mirroring idempotency/guards in api/complete-stellar.js
const HASH_RE = /^0x[0-9a-fA-F]{64}$/
const REPLAY_RE = /already|used|nonce|exists|replay/i

const makeCompleter = () => ({ kv: new Map(), rl: new Map() })

function complete(ctx, { txHash, ip = "1.1.1.1", attestation = { status: "complete", attestation: "0xabc", message: "0xmsg" }, simOutcome = "ok" }) {
  if (!HASH_RE.test(txHash || "")) return { status: "bad_request" }
  const n = (ctx.rl.get(ip) || 0) + 1; ctx.rl.set(ip, n)
  if (n > 10) return { status: "rate_limited" }
  const cacheKey = "complete:" + txHash
  if (ctx.kv.has(cacheKey)) return Object.assign({ cached: true }, ctx.kv.get(cacheKey))
  if (!attestation || attestation.status !== "complete" || !attestation.message || !attestation.attestation || attestation.attestation === "PENDING") return { status: "pending" }
  if (simOutcome === "replay") { const done = { status: "already_completed" }; ctx.kv.set(cacheKey, done); return done }
  if (simOutcome === "sim_error") return { status: "sim_failed" }
  const result = { status: "success", stellarTxHash: "stellar-" + txHash }; ctx.kv.set(cacheKey, result); return result
}

const H = "0x" + "a".repeat(64)
const H2 = "0x" + "b".repeat(64)

test("cctp: rejects invalid txHash", () => assert.equal(complete(makeCompleter(), { txHash: "0x123" }).status, "bad_request"))
test("cctp: accepts well-formed txHash", () => assert.equal(complete(makeCompleter(), { txHash: H }).status, "success"))
test("cctp: rate limits after 10 requests per ip", () => { const c = makeCompleter(); let last; for (let i = 0; i < 11; i++) last = complete(c, { txHash: H, ip: "9.9.9.9" }); assert.equal(last.status, "rate_limited") })
test("cctp: pending when attestation not ready", () => assert.equal(complete(makeCompleter(), { txHash: H, attestation: { status: "pending_confirmations", attestation: "PENDING" } }).status, "pending"))
test("cctp: idempotent — second success returns cached (no double mint)", () => { const c = makeCompleter(); const a = complete(c, { txHash: H }); assert.ok(!a.cached); const b = complete(c, { txHash: H }); assert.equal(b.cached, true); assert.equal(b.status, "success") })
test("cctp: replay sim error -> already_completed and cached", () => { const c = makeCompleter(); const r = complete(c, { txHash: H, simOutcome: "replay" }); assert.equal(r.status, "already_completed"); const again = complete(c, { txHash: H }); assert.equal(again.cached, true); assert.equal(again.status, "already_completed") })
test("cctp: replay regex matches Soroban variants, not benign errors", () => { assert.ok(REPLAY_RE.test("nonce already used")); assert.ok(REPLAY_RE.test("message exists")); assert.ok(!REPLAY_RE.test("insufficient fee")) })
test("cctp: distinct txHash unaffected by another's cache", () => { const c = makeCompleter(); complete(c, { txHash: H }); const o = complete(c, { txHash: H2 }); assert.ok(!o.cached); assert.equal(o.status, "success") })
