import { test } from "node:test"
import assert from "node:assert/strict"

// Pure model mirroring decide() in api/agent-payout.js
const G_RE = /^G[A-Z2-7]{55}$/
const DEFAULT_POLICY = { enabled: true, recipientG: "GBNJ2JNNLKQ53MO353PPOTNKI47DMHWVULKXMJMNLQWPF3FBIOA2CAZK", sharePct: 30, minThresholdUSDC: 1, perPayoutCapUSDC: 5 }

function decide(policy, available) {
  if (!policy.enabled) return { action: "hold", amount: 0, reason: "policy disabled" }
  if (!G_RE.test(policy.recipientG || "")) return { action: "hold", amount: 0, reason: "no valid recipient" }
  if (available < policy.minThresholdUSDC) return { action: "hold", amount: 0, reason: "available below min threshold" }
  let amt = available * (policy.sharePct / 100)
  if (amt > policy.perPayoutCapUSDC) amt = policy.perPayoutCapUSDC
  amt = Math.floor(amt * 10000) / 10000
  if (amt <= 0) return { action: "hold", amount: 0, reason: "computed amount is zero" }
  return { action: "payout", amount: amt, reason: "routing " + policy.sharePct + " percent of available revenue to Stellar" }
}
const P = (o = {}) => Object.assign({}, DEFAULT_POLICY, o)

test("payout: disabled policy holds", () => assert.equal(decide(P({ enabled: false }), 100).action, "hold"))
test("payout: invalid recipient holds", () => { const d = decide(P({ recipientG: "not-a-stellar-addr" }), 100); assert.equal(d.action, "hold"); assert.match(d.reason, /recipient/) })
test("payout: valid Stellar G-address passes regex", () => assert.ok(G_RE.test(DEFAULT_POLICY.recipientG)))
test("payout: below min threshold holds", () => assert.equal(decide(P(), 0.5).action, "hold"))
test("payout: at min threshold pays out 0.3", () => { const d = decide(P(), 1); assert.equal(d.action, "payout"); assert.equal(d.amount, 0.3) })
test("payout: 30% of 10 = 3 (below cap)", () => assert.equal(decide(P(), 10).amount, 3))
test("payout: per-payout cap enforced (30% of 100 -> 5)", () => assert.equal(decide(P(), 100).amount, 5))
test("payout: cap boundary ~16.67 stays <= 5", () => assert.ok(decide(P(), 16.6667).amount <= 5))
test("payout: amount floored to 4 decimals", () => assert.equal(decide(P(), 1.23457).amount, 0.3703))
test("payout: computed zero holds (sharePct 0)", () => { const d = decide(P({ sharePct: 0 }), 100); assert.equal(d.action, "hold"); assert.match(d.reason, /zero/) })
test("payout: custom cap respected", () => assert.equal(decide(P({ perPayoutCapUSDC: 2 }), 100).amount, 2))
