// Cronus — spend-intent round-trip proof.
// Uses an EPHEMERAL, UNFUNDED key for an off-chain EIP-712 signature only (no funds, no on-chain tx).
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
const BASE = process.env.CRONUS_BASE || "https://cronus-capital.vercel.app"
let pass = 0, fail = 0
function ok(n, c, d) { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? " — " + d : "")); if (c) pass++; else fail++ }
async function j(path, opts) { try { const r = await fetch(BASE + path, opts); let b = null; try { b = await r.json() } catch (e) {} return { status: r.status, body: b } } catch (e) { return { status: 0, body: null } } }

console.log("Cronus — spend-intent round-trip (ephemeral UNFUNDED key; off-chain EIP-712 signature only)")
console.log("base: " + BASE)
const s = await j("/api/spend-intent")
ok("GET schema 200 + ok", s.status === 200 && !!s.body && s.body.ok === true)
const domain = s.body && s.body.domain
const types = s.body && s.body.types
const treasury = s.body && s.body.binding && s.body.binding.payTo
const usdc = s.body && s.body.binding && s.body.binding.asset

const acct = privateKeyToAccount(generatePrivateKey())
const now = Math.floor(Date.now() / 1000)
const deadline = String(now + 3600)
const maxAmount = "1000"
const nonce = String(Date.now())
const intent = { payer: acct.address, payTo: treasury, asset: usdc, maxAmount: maxAmount, nonce: nonce, deadline: deadline }
const message = { payer: acct.address, payTo: treasury, asset: usdc, maxAmount: BigInt(maxAmount), nonce: BigInt(nonce), deadline: BigInt(deadline) }
const signature = await acct.signTypedData({ domain: domain, types: types, primaryType: "SpendIntent", message: message })

const r1 = await j("/api/spend-intent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent: intent, signature: signature }) })
ok("valid:true on first submit", !!r1.body && r1.body.valid === true, r1.body && r1.body.reason)
ok("recovered signer == payer", !!r1.body && String(r1.body.signer).toLowerCase() === acct.address.toLowerCase())
const replayProtected = !!(r1.body && r1.body.replayProtected)

const r2 = await j("/api/spend-intent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent: intent, signature: signature }) })
if (replayProtected) { ok("replay of same nonce rejected", !!r2.body && r2.body.valid === false && /replay/i.test(String((r2.body && r2.body.reason) || "")), r2.body && r2.body.reason) }
else { ok("replay-protection reported OFF honestly (KV not configured)", !!r2.body && r2.body.valid === true, "no KV — not fabricating replay-protection") }

const tampered = { payer: acct.address, payTo: treasury, asset: usdc, maxAmount: "999999999", nonce: nonce, deadline: deadline }
const r3 = await j("/api/spend-intent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent: tampered, signature: signature }) })
ok("tampered amount -> rejected (signature binds the terms)", !!r3.body && r3.body.valid === false, r3.body && r3.body.reason)

console.log("\n================================================")
console.log((fail === 0 ? "ALL CHECKS PASSED" : fail + " CHECK(S) FAILED") + " — " + pass + " passed, " + fail + " failed")
console.log("Ephemeral key only; no funds, no on-chain tx. Reproduce: npm run verify-intent")
process.exit(fail === 0 ? 0 : 1)
