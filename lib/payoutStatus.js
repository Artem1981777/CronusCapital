// lib/payoutStatus.js — read-only payout-agent status derived from /api/agent-payout.
export default async function payoutStatus(req, res) {
  try {
    const base = ((req.headers && req.headers["x-forwarded-proto"]) || "https") + "://" + ((req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "cronus-capital.vercel.app")
    const r = await fetch(base + "/api/agent-payout?action=status"); const j = await r.json()
    const ledger = (j && j.ledger) || []; const policy = (j && j.policy) || {}
    const payouts = ledger.filter(x => x && x.action === "payout"); const lastPayout = payouts[0] || null
    res.status(200).json({ ok: true, enabled: policy.enabled !== false, available_usdc: (j && j.available) || 0, last_run_at: (ledger[0] && ledger[0].at) || null, next_run_at: null, total_payouts: payouts.length, last_payout_amount: lastPayout ? lastPayout.amount : null, decision_count: ledger.length, hash_chain_tip: (ledger[0] && ledger[0].hash) || null, recipient: policy.recipientG || null, updatedAt: new Date().toISOString() })
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) }) }
}
