// lib/privacy/routes.js — маршруты селективного раскрытия (sd-1). ADDITIVE.
// GET /api/disclosure?tx=0x..&reveal=kind,settled  — построить раскрытие по РЕАЛЬНОЙ квитанции
// POST /api/disclosure-verify  (тело = ответ выше) — проверить чужое раскрытие
import { buildDisclosure, verifyDisclosure, FIELD_ORDER, DISCLOSURE_VERSION, DEFAULT_CAP_ATOMIC } from "./selectiveDisclosure.js"
import receiptsHandler from "../receipts.js"

const DEFAULT_REVEAL = ["kind", "settled", "predicate:amount_within_policy_cap"]

async function loadReceipts(req) {
  let payload = null
  const res = { setHeader() {}, status() { return this }, json(o) { payload = o; return o } }
  await receiptsHandler({ ...req, method: "GET", query: {} }, res)
  return payload
}

async function disclosure(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  const q = req.query || {}
  const cap = Number(q.cap || DEFAULT_CAP_ATOMIC)
  const reveal = q.reveal ? String(q.reveal).split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_REVEAL
  const data = await loadReceipts(req)
  const list = (data && data.receipts) || []
  if (!list.length) return res.status(503).json({ ok: false, error: "no receipts available upstream" })
  const wanted = q.tx ? String(q.tx).toLowerCase() : null
  const r = wanted ? list.find((x) => String(x.txHash).toLowerCase() === wanted) : list[0]
  if (!r) return res.status(404).json({ ok: false, error: "receipt not found", tx: q.tx })
  const d = buildDisclosure(r, reveal, { policyCapAtomic: cap })
  return res.status(200).json({
    ok: true,
    ...d,
    fields: FIELD_ORDER,
    principle: "The payer proves a receipt satisfies the spend policy without revealing the amount, the counterparty, or the transaction hash. Hidden leaves cannot be altered: any change moves the Merkle root.",
    limitation: "Selective disclosure, NOT zero-knowledge. The verifier learns how many fields exist and that a policy cap is in force, just not the hidden values.",
    verify: "POST this JSON to /api/disclosure-verify, or recompute locally: leaf = keccak256(keccak256(field || 0x00 || value)), pairs sorted (OpenZeppelin-compatible).",
  })
}

async function disclosureVerify(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  let body = req.body
  if (typeof body === "string") { try { body = JSON.parse(body) } catch (_) { body = null } }
  if (!body && req.query && req.query.d) { try { body = JSON.parse(Buffer.from(String(req.query.d), "base64url").toString("utf8")) } catch (_) { body = null } }
  if (!body) return res.status(400).json({ ok: false, error: "send the disclosure JSON as the request body" })
  const out = verifyDisclosure(body)
  return res.status(out.ok ? 200 : 422).json({ version: DISCLOSURE_VERSION, ...out })
}

export const PRIVACY_ROUTES = { "disclosure": disclosure, "disclosure-verify": disclosureVerify }
export default PRIVACY_ROUTES
