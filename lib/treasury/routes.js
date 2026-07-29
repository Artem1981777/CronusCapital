import { buildTreasuryYield } from "./usyc.js"

async function treasuryYield(req, res) {
  const horizonDays = Math.min(365, Math.max(1, Number((req.query && req.query.days) || 30)))
  try {
    const out = await buildTreasuryYield({ horizonDays })
    return res.status(200).json(out)
  } catch (e) {
    return res.status(502).json({ ok: false, error: "arc rpc unavailable", detail: String((e && e.message) || e) })
  }
}

export const TREASURY_ROUTES = { "treasury-yield": treasuryYield }
export default TREASURY_ROUTES
