// lib/intents.js — EIP-712 signed spend-intents + KV replay-protection (ADDITIVE).
// An agent signs a SpendIntent off-chain (no gas). Cronus recovers the signer, enforces
// deadline + binding (payTo=treasury, asset=Arc USDC), and rejects nonce reuse via Upstash.
// HONEST: this VERIFIES authorization only; it moves no funds and fabricates no on-chain hash.
//   GET  /api/spend-intent  -> EIP-712 schema (domain+types) for agents to sign
//   POST /api/spend-intent  -> { intent, signature } => { ok, valid, signer, replayProtected, reason }
import { recoverTypedDataAddress, getAddress, isAddress } from "viem"

const CHAIN_ID = Number(process.env.ARC_CHAIN_ID || 5042002)
const USDC = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase()
const TREASURY = (process.env.CRONUS_PAYTO || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd").toLowerCase()
const NONCE_TTL = Number(process.env.INTENT_NONCE_TTL || 604800)

const DOMAIN = { name: "CronusCapital", version: "1", chainId: CHAIN_ID, verifyingContract: getAddress(TREASURY) }
const TYPES = { SpendIntent: [
  { name: "payer", type: "address" },
  { name: "payTo", type: "address" },
  { name: "asset", type: "address" },
  { name: "maxAmount", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
] }
const PRIMARY = "SpendIntent"

async function kv(cmd) {
  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return { configured: false, result: null }
  try {
    const r = await fetch(base, { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(cmd) })
    const j = await r.json()
    return { configured: true, result: j && j.result }
  } catch (e) { return { configured: true, result: null, error: String((e && e.message) || e) } }
}

function schema() {
  return {
    ok: true, primaryType: PRIMARY, domain: DOMAIN, types: TYPES,
    binding: { payTo: TREASURY, asset: USDC, chainId: CHAIN_ID },
    howTo: "Sign the SpendIntent typed-data with the payer key (viem account.signTypedData), then POST { intent, signature }. Cronus recovers the signer, enforces deadline + binding, and rejects nonce reuse. Authorizes a spend; does not itself move funds.",
    honesty: "Verification only. No funds moved and no on-chain hash produced by this endpoint.",
  }
}

async function verify(body) {
  const intent = body && body.intent
  const signature = body && body.signature
  if (!intent || !signature) return { ok: true, valid: false, reason: "missing intent or signature" }
  const fields = ["payer", "payTo", "asset", "maxAmount", "nonce", "deadline"]
  for (const f of fields) { if (intent[f] === undefined || intent[f] === null) return { ok: true, valid: false, reason: "missing field: " + f } }
  if (!isAddress(intent.payer) || !isAddress(intent.payTo) || !isAddress(intent.asset)) return { ok: true, valid: false, reason: "invalid address in intent" }
  if (String(intent.payTo).toLowerCase() !== TREASURY) return { ok: true, valid: false, reason: "payTo must be the Cronus treasury" }
  if (String(intent.asset).toLowerCase() !== USDC) return { ok: true, valid: false, reason: "asset must be Arc USDC" }
  const now = Math.floor(Date.now() / 1000)
  let message
  try {
    const deadline = BigInt(intent.deadline)
    if (deadline < BigInt(now)) return { ok: true, valid: false, reason: "intent expired (deadline passed)" }
    message = { payer: getAddress(intent.payer), payTo: getAddress(intent.payTo), asset: getAddress(intent.asset), maxAmount: BigInt(intent.maxAmount), nonce: BigInt(intent.nonce), deadline: deadline }
  } catch (e) { return { ok: true, valid: false, reason: "maxAmount/nonce/deadline must be integers" } }
  let signer
  try { signer = await recoverTypedDataAddress({ domain: DOMAIN, types: TYPES, primaryType: PRIMARY, message: message, signature: signature }) }
  catch (e) { return { ok: true, valid: false, reason: "signature recovery failed: " + String((e && e.message) || e) } }
  if (getAddress(signer) !== getAddress(intent.payer)) return { ok: true, valid: false, signer: signer, reason: "signer does not match payer" }
  const key = "intent:" + String(intent.payer).toLowerCase() + ":" + String(intent.nonce)
  const claim = await kv(["SET", key, String(now), "NX", "EX", String(NONCE_TTL)])
  if (claim.configured && claim.result !== "OK") return { ok: true, valid: false, signer: signer, replayProtected: true, reason: "nonce already used (replay rejected)" }
  return {
    ok: true, valid: true, signer: signer,
    payer: getAddress(intent.payer), payTo: getAddress(intent.payTo), asset: getAddress(intent.asset),
    maxAmount: String(message.maxAmount), nonce: String(message.nonce), deadline: String(message.deadline),
    replayProtected: claim.configured,
    reason: claim.configured ? "intent authorized" : "intent authorized (signature valid; KV not configured, replay-protection OFF — reported honestly)",
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "content-type")
  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method === "GET") return res.status(200).json(schema())
  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {})
      return res.status(200).json(await verify(body))
    } catch (e) { return res.status(400).json({ ok: false, valid: false, reason: "bad request: " + String((e && e.message) || e) }) }
  }
  return res.status(405).json({ ok: false, error: "method not allowed", allow: ["GET", "POST"] })
}
export { schema, verify }
