// api/agent-loop.js — READ-ONLY view of the latest full agent-to-agent loop.
// Composes the loop-receipt from already-recorded honest artifacts (no writes, no funds):
//   nano settlement (buyer->seller) + upstream COGS + reputation note + external_payers.
// HONEST: every leg is self-operated demo; external_payers stays 0. We never fake demand.

async function kv(cmd) {
  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return null
  try {
    const r = await fetch(base, { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(cmd) })
    const j = await r.json()
    return j && j.result
  } catch (_) { return null }
}

async function lrange(key) {
  const raw = await kv(["LRANGE", key, "0", "49"])
  if (!Array.isArray(raw)) return []
  return raw.map((s) => { try { return JSON.parse(s) } catch (_) { return null } }).filter(Boolean)
}

const EXP = "https://testnet.arcscan.app/tx/"
const isTx = (t) => /^0x[0-9a-fA-F]{64}$/.test(String(t || ""))

export default async function handler(req, res) {
  try {
    const nano = await lrange("cronus:nano:ledger")
    const cogs = await lrange("cronus:cogs:log")
    const lastNano = nano[0] || null
    const lastCogs = cogs[0] || null

    const host = req.headers["x-forwarded-host"] || req.headers.host
    const proto = req.headers["x-forwarded-proto"] || "https"
    let external_payers = 0
    try {
      const tr = await fetch(proto + "://" + host + "/api/traction")
      const tj = await tr.json()
      if (tj && tj.external_payers != null) external_payers = tj.external_payers
    } catch (_) {}

    const loop = {
      ok: true,
      updatedAt: Date.now(),
      honest_label: "Full agent-to-agent commerce loop. Every leg is self-operated demo (labeled), so external_payers stays 0. We never fake demand.",
      legs: {
        buyer_seller: lastNano ? {
          resource: "/api/nano-signal",
          tier: "NANO",
          settlement: "circle-gateway-batched",
          amountUsdc: lastNano.amount ? Number(lastNano.amount) / 1e6 : null,
          payer: lastNano.payer || null,
          tx: lastNano.transaction || null,
          explorer: isTx(lastNano.transaction) ? EXP + lastNano.transaction : null,
          verdict: lastNano.verdict || null,
          at: lastNano.ts || null,
          self_operated_demo: true
        } : null,
        cogs: lastCogs ? {
          role: "Cronus pays upstream data provider (cost-of-goods)",
          amountAtomic: lastCogs.amountAtomic || null,
          amountUsdc: lastCogs.amountAtomic ? Number(lastCogs.amountAtomic) / 1e6 : null,
          to: lastCogs.to || null,
          tx: lastCogs.txRef || null,
          explorer: lastCogs.explorer || null,
          at: lastCogs.at || null,
          self_operated_demo: true
        } : null,
        reputation: {
          standard: "ERC-8004",
          note: "Buyer writes giveFeedback(sellerAgentId, score, jobRef, uri) after consuming; identity-gated and de-duplicated per jobRef. Verify on Arc explorer."
        },
        honesty: {
          external_payers: external_payers,
          source: "/api/traction",
          note: "Self-generated A2A demo volume is labeled and excluded from external demand."
        }
      },
      counts: { nano_settlements: nano.length, cogs_settlements: cogs.length },
      reproduce: "node scripts/agent-loop.mjs --live   (dry: node scripts/agent-loop.mjs --json)"
    }
    res.status(200).json(loop)
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) })
  }
}
