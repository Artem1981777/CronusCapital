// api/signal.js  —  x402-gated premium signal (Lepton · RFB 02 + 06)
const X402_VERSION = 1

const NETWORK     = process.env.X402_NETWORK     || "arc-testnet"
const USDC_ASSET  = process.env.ARC_USDC_ADDRESS || "0xUSDC_ON_ARC_TESTNET"
const PAY_TO      = process.env.CRONUS_PAYTO     || "0xYOUR_CRONUS_WALLET"
const PRICE       = process.env.SIGNAL_PRICE     || "20000"
const FACILITATOR = process.env.X402_FACILITATOR || "https://x402.org/facilitator"
const DEMO        = process.env.X402_DEMO === "1"

function paymentRequirements(resource) {
  return {
    x402Version: X402_VERSION,
    accepts: [{
      scheme: "exact", network: NETWORK, maxAmountRequired: PRICE, resource,
      description: "Cronus Capital - full +EV market analysis (one report)",
      mimeType: "application/json", payTo: PAY_TO, maxTimeoutSeconds: 120,
      asset: USDC_ASSET, extra: { name: "USDC", version: "2" },
    }],
    error: "X-PAYMENT header required",
  }
}

const decode = (h) => JSON.parse(Buffer.from(h, "base64").toString("utf8"))

function payerOf(header) {
  try {
    const p = decode(header)
    return (p && (p.payer || (p.payload && p.payload.authorization && p.payload.authorization.from) || p.from)) || "demo"
  } catch (_) { return "demo" }
}

function memoOf(header) {
	try { const p = decode(header); return (p && p.memo) || null } catch (e) { return null }
}

async function facilitator(path, header, requirements) {
  const res = await fetch(`${FACILITATOR}/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x402Version: X402_VERSION, paymentPayload: decode(header), paymentRequirements: requirements.accepts[0] }),
  })
  return res.json()
}

async function generateReport(topic) {
  const key = process.env.ANTHROPIC_API_KEY
  const system = "You are Cronus, an autonomous market-intelligence analyst. Return ONLY valid JSON: " +
    '{ "topic": string, "thesis": string, "opportunities": [{ "question": string, "recommendation": "YES"|"NO", "expectedValue": number, "size": number, "reasoning": string }], "riskNote": string }'
  if (key) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system,
          messages: [{ role: "user", content: "Full +EV analysis for: " + topic }] }),
      })
      const data = await r.json()
      const text = (data && data.content && data.content[0] && data.content[0].text) || ""
      if (text) return JSON.parse(text.replace(/```json|```/g, "").trim())
    } catch (_) {}
  }
  return {
    topic,
    thesis: "Edge detected on " + topic + ": implied odds lag fair value on recent sentiment.",
    opportunities: [{ question: "Will " + topic + " resolve YES this cycle?", recommendation: "YES",
      expectedValue: 68, size: 25, reasoning: "Bayesian prior vs market price; Kelly-sized at 25 USDC." }],
    riskNote: "Max 5% bankroll per position; min edge 3%.",
  }
}

export default async function handler(req, res) {
  const topic = String((req.query && req.query.topic) || "crypto markets")
  const host = (req.headers && req.headers.host) || "localhost"
  const resource = "https://" + host + "/api/signal?topic=" + encodeURIComponent(topic)
  const requirements = paymentRequirements(resource)

  const header = req.headers["x-payment"]
  if (!header) { res.status(402).json(requirements); return }

  if (DEMO) {
    const report = await generateReport(topic)
    res.setHeader("X-PAYMENT-RESPONSE", Buffer.from(JSON.stringify({ success: true, network: NETWORK, demo: true })).toString("base64"))
    res.status(200).json({ paid: true, demo: true, payer: payerOf(header), memo: memoOf(header), report })
    return
  }

  try {
    const v = await facilitator("verify", header, requirements)
    if (!v.isValid) { res.status(402).json({ ...requirements, error: v.invalidReason || "payment invalid" }); return }
    const report = await generateReport(topic)
    const settlement = await facilitator("settle", header, requirements)
    if (settlement && settlement.success)
      res.setHeader("X-PAYMENT-RESPONSE", Buffer.from(JSON.stringify(settlement)).toString("base64"))
    res.status(200).json({ paid: true, payer: v.payer, memo: memoOf(header), settlement, report })
  } catch (e) { res.status(500).json({ error: String(e) }) }
}
