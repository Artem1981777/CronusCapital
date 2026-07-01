// spend-breaker.mjs - reusable in-code spend cap / circuit breaker for USDC
// outflows on Arc (or any chain). MIT. Zero dependencies.
//
// Money safety belongs in code, not in a model. decideSpend() is a pure,
// deterministic gate: given how much was already spent in the window, the
// requested amount, and the hard cap (all atomic units, e.g. 6-dp USDC), it
// returns allow/deny and the remaining budget. A hallucinated or adversarial
// amount can never exceed the cap.
import { fileURLToPath } from "node:url"

// pure: inputs are atomic-unit strings/bigints. Never throws on normal input.
export function decideSpend({ spentAtomic, amountAtomic, capAtomic }) {
  const spent = BigInt(spentAtomic || "0")
  const amt = BigInt(amountAtomic || "0")
  const cap = BigInt(capAtomic || "0")
  const remaining = cap > spent ? cap - spent : 0n
  if (amt <= 0n) return { allowed: false, reason: "amount must be > 0", remainingAtomic: String(remaining) }
  if (amt > remaining) return { allowed: false, reason: "exceeds remaining budget", remainingAtomic: String(remaining) }
  return { allowed: true, reason: "within budget", remainingAtomic: String(remaining - amt) }
}

// convenience: a tiny in-memory breaker for standalone/single-process use.
// For production, back the running total with a shared store (e.g. Redis INCRBY).
export function createBreaker(capAtomic) {
  let spent = 0n
  return {
    try(amountAtomic) {
      const d = decideSpend({ spentAtomic: String(spent), amountAtomic, capAtomic })
      if (d.allowed) spent += BigInt(amountAtomic || "0")
      return d
    },
    spentAtomic: () => String(spent),
  }
}

function selftest() {
  const cap = "1000000" // 1.0 USDC at 6dp
  const b = createBreaker(cap)
  const r1 = b.try("600000") // ok, 0.4 left
  const r2 = b.try("600000") // blocked, only 0.4 left
  const r3 = b.try("400000") // ok, 0 left
  const r4 = b.try("1")      // blocked
  const ok = r1.allowed && !r2.allowed && r3.allowed && !r4.allowed && b.spentAtomic() === "1000000"
  console.log(JSON.stringify({ ok, r1, r2, r3, r4, spent: b.spentAtomic() }, null, 2))
  if (!ok) process.exit(1)
}

// CLI: node spend-breaker.mjs <spentAtomic> <amountAtomic> <capAtomic>
//      node spend-breaker.mjs selftest
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args[0] === "selftest") { selftest() }
  else {
    const [spentAtomic, amountAtomic, capAtomic] = args
    if (!amountAtomic || !capAtomic) {
      console.error("usage: node spend-breaker.mjs <spentAtomic> <amountAtomic> <capAtomic>  |  node spend-breaker.mjs selftest")
      process.exit(1)
    }
    console.log(JSON.stringify(decideSpend({ spentAtomic: spentAtomic || "0", amountAtomic, capAtomic }), null, 2))
  }
}
