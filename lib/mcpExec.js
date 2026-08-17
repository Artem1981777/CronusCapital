// lib/mcpExec.js — PRIVATE MCP execute layer (auth-gated, server-side exec secret).
// Loaded by lib/mcp.js only when kind=mcp-private. Zero extra serverless functions.

import { emergencyPaused, pauseError } from "./guard.js"
const MCP_PRIVATE_TOKEN = process.env.MCP_PRIVATE_TOKEN || ""
const MCP_DEMO_TOKEN = process.env.MCP_DEMO_TOKEN || "cronus-judge-2026"
const DEMO_SWAP_MAX_ATOMIC = 100000
const DEMO_BRIDGE_MAX_USDC = 0.5
const DEMO_SWAP_DAILY_MAX = 20
const DEMO_BRIDGE_DAILY_MAX = 5
const DEMO_RATE_MS = 60000
const CRONUS_EXEC_SECRET = process.env.CRONUS_EXEC_SECRET || ""
const CRONUS_BRIDGE_EXEC_SECRET = process.env.CRONUS_BRIDGE_EXEC_SECRET || CRONUS_EXEC_SECRET
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ""
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ""

// Cronus treasury-owned addresses — bridge execute may ONLY send here.
const ALLOW_EVM = ["0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd", "0x6829860b7f61FA01E5bf3D194d9f780ACa5B6787"].map(function (s) { return s.toLowerCase() })
const ALLOW_STELLAR = ["GBNJ2JNNLKQ53MO353PPOTNKI47DMHWVULKXMJMNLQWPF3FBIOA2CAZK"]

function isAllowlisted(to) {
  if (typeof to !== "string" || !to) return false
  if (/^0x[0-9a-fA-F]{40}$/.test(to)) return ALLOW_EVM.indexOf(to.toLowerCase()) !== -1
  if (/^G[A-Z2-7]{55}$/.test(to)) return ALLOW_STELLAR.indexOf(to) !== -1
  return false
}

export function readPrivateToken(req) {
  const h = (req && req.headers) || {}
  const x = h["x-mcp-token"]
  if (typeof x === "string" && x) return x
  const auth = h.authorization || h.Authorization
  if (typeof auth === "string" && auth) return auth.replace(/^Bearer\s+/i, "")
  const q = (req && req.query) || {}
  if (typeof q.k === "string" && q.k) return q.k
  return ""
}

export function tokenTier(req) {
	const t = readPrivateToken(req)
	if (!t) return null
	if (MCP_PRIVATE_TOKEN && t === MCP_PRIVATE_TOKEN) return "private"
	if (MCP_DEMO_TOKEN && t === MCP_DEMO_TOKEN) return "demo"
	return null
}

export function isPrivateAuthorized(req) {
  if (!MCP_PRIVATE_TOKEN) return false
  const t = readPrivateToken(req)
  return t.length > 0 && (t === MCP_PRIVATE_TOKEN || t === MCP_DEMO_TOKEN)
}

async function auditExec(entry) {
  if (!KV_URL || !KV_TOKEN) return
  try {
    const val = encodeURIComponent(JSON.stringify(entry))
    await fetch(KV_URL + "/lpush/" + encodeURIComponent("cronus:mcp:audit") + "/" + val, { headers: { Authorization: "Bearer " + KV_TOKEN } })
  } catch (e) { /* best-effort audit */ }
}

async function post(base, path, body, clientName) {
  const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "x-mcp-client": clientName || "claude-private" }, body: JSON.stringify(body || {}) })
  const text = await res.text()
  let b; try { b = JSON.parse(text) } catch (e) { b = { raw: text } }
  return { status: res.status, body: b }
}

async function kvGet(key) {
	if (!KV_URL || !KV_TOKEN) return null
	try { const r = await fetch(KV_URL + "/get/" + encodeURIComponent(key), { headers: { Authorization: "Bearer " + KV_TOKEN } }); const j = await r.json(); return (j && typeof j.result !== "undefined") ? j.result : null } catch (e) { return null }
}
async function kvSet(key, val) {
	if (!KV_URL || !KV_TOKEN) return
	try { await fetch(KV_URL + "/set/" + encodeURIComponent(key) + "/" + encodeURIComponent(val), { headers: { Authorization: "Bearer " + KV_TOKEN } }) } catch (e) {}
}
async function kvIncr(key) {
	if (!KV_URL || !KV_TOKEN) return 0
	try { const r = await fetch(KV_URL + "/incr/" + encodeURIComponent(key), { headers: { Authorization: "Bearer " + KV_TOKEN } }); const j = await r.json(); return (j && j.result != null) ? Number(j.result) : 0 } catch (e) { return 0 }
}
function demoDayKey(kind) { return "cronus:mcp:demo:" + kind + ":day:" + new Date().toISOString().slice(0, 10) }
async function demoRateOk() {
	const now = Date.now(); const last = await kvGet("cronus:mcp:demo:last")
	if (last && (now - Number(last)) < DEMO_RATE_MS) return false
	await kvSet("cronus:mcp:demo:last", String(now)); return true
}
async function demoGuardSwap(base, args) {
  const side = typeof args.side === "string" ? args.side : "usdc_to_crn"
  if (side !== "usdc_to_crn" && side !== "crn_to_usdc") return { endpoint: "/api/swap", httpStatus: 400, tier: "demo", error: "demo token: unknown swap side", _isError: true }
  // Demo cap enforced in USDC-equivalent. usdc_to_crn: amountIn is USDC atomic.
  // crn_to_usdc: amountIn is CRN atomic -> price via a dry-run pool quote to USDC.
  let usdcEquiv
  if (side === "usdc_to_crn") {
    usdcEquiv = Number(args.amountIn)
  } else {
    const dq = await post(base, "/api/swap", { side: "crn_to_usdc", amountIn: args.amountIn, autoSignal: false, execute: false }, "demo")
    const out = dq && dq.body && dq.body.preview && dq.body.preview.expectedOut
    usdcEquiv = Number(out)
  }
  if (!(usdcEquiv > 0) || usdcEquiv > DEMO_SWAP_MAX_ATOMIC) return { endpoint: "/api/swap", httpStatus: 403, tier: "demo", error: "demo token: swap value exceeds cap (max " + DEMO_SWAP_MAX_ATOMIC + " atomic = 0.1 USDC equiv)", _isError: true }
  if (!(await demoRateOk())) return { endpoint: "/api/swap", httpStatus: 429, tier: "demo", error: "demo token: rate limited (1 per minute)", _isError: true }
  const n = await kvIncr(demoDayKey("swap"))
  if (n > DEMO_SWAP_DAILY_MAX) return { endpoint: "/api/swap", httpStatus: 429, tier: "demo", error: "demo token: daily swap limit reached (" + DEMO_SWAP_DAILY_MAX + "/day)", _isError: true }
  return null
}
async function demoGuardBridge(args) {
	const amt = Number(args.amount)
	if (!(amt > 0) || amt > DEMO_BRIDGE_MAX_USDC) return { endpoint: "/api/bridge", httpStatus: 403, tier: "demo", error: "demo token: amount exceeds cap (max " + DEMO_BRIDGE_MAX_USDC + " USDC)", _isError: true }
	if (!(await demoRateOk())) return { endpoint: "/api/bridge", httpStatus: 429, tier: "demo", error: "demo token: rate limited (1 per minute)", _isError: true }
	const n = await kvIncr(demoDayKey("bridge"))
	if (n > DEMO_BRIDGE_DAILY_MAX) return { endpoint: "/api/bridge", httpStatus: 429, tier: "demo", error: "demo token: daily bridge limit reached (" + DEMO_BRIDGE_DAILY_MAX + "/day)", _isError: true }
	return null
}

export const PRIVATE_EXECUTE_TOOLS = [
  { name: "cronus_swap_execute", description: "PRIVATE (auth-gated): execute a REAL on-chain swap in Cronus's own USDC/CRN AMM on Arc. The server injects the Cronus exec secret from its own env; the caller never supplies a key. Funds stay inside Cronus's own pool (no external recipient). Server-enforced caps: 2 USDC/swap, 50/day, treasury-signed, 1/min.", inputSchema: { type: "object", properties: { side: { type: "string", enum: ["usdc_to_crn", "crn_to_usdc"], description: "Swap direction. Default usdc_to_crn." }, amountIn: { type: "string", description: "Input amount in atomic units (6dp), e.g. 100000 = 0.1 USDC." }, slippageBps: { type: "number", description: "Max slippage in bps (default 100)." }, autoSignal: { type: "boolean", description: "If true (default), gate on a live Cronus signal (conviction >= 65)." }, instId: { type: "string", description: "Instrument id for the optional signal gate, e.g. BTC-USDC." } }, required: ["side", "amountIn"] } },
  { name: "cronus_bridge_execute", description: "PRIVATE (auth-gated): execute a REAL CCTP bridge burn of Cronus treasury USDC on Arc. The server injects the Cronus exec secret from its own env; the caller never supplies a key. Recipient MUST be a Cronus treasury-owned allowlisted address (funds only move between Cronus's own wallets); any other recipient is rejected with 403. Server-enforced caps: 5 USDC/bridge, shared daily breaker, 1/min.", inputSchema: { type: "object", properties: { dest: { type: "string", enum: ["stellar", "baseSepolia", "sepolia", "arbitrumSepolia", "arc"], description: "Destination chain: stellar or an EVM chain name (incl. arc)." }, source: { type: "string", enum: ["arc", "baseSepolia"], description: "Source chain to burn from. Default arc. Use baseSepolia for the Base->Arc reverse leg." }, to: { type: "string", description: "Recipient — MUST be a Cronus treasury allowlisted address (Stellar G-address for stellar, else the treasury 0x address)." }, amount: { type: "string", description: "Amount in USDC (decimal), e.g. 1.0." }, maxFee: { type: "string", description: "Optional max CCTP fee in USDC; default amount/100." } }, required: ["dest", "to", "amount"] } },
	{ name: "cronus_bridge_complete", description: "PRIVATE (auth-gated): finalize a REAL Arc->EVM CCTP bridge by minting on the destination chain. Given the Arc burn txHash from cronus_bridge_execute, the server fetches the Circle attestation and calls MessageTransmitterV2.receiveMessage on the destination (e.g. Base Sepolia), minting USDC to the recipient encoded in the original burn. Moves no NEW funds (only finalizes an already-burned, attested transfer); the server pays destination gas. Idempotent per burn txHash. Returns the real destination mintTxHash + explorer.", inputSchema: { type: "object", properties: { txHash: { type: "string", description: "The Arc burn txHash returned by cronus_bridge_execute (0x + 64 hex)." }, dest: { type: "string", enum: ["baseSepolia", "sepolia", "arbitrumSepolia", "optimismSepolia", "arc"], description: "Optional destination EVM chain override; auto-resolved from the attestation if omitted." }, source: { type: "string", enum: ["arc", "baseSepolia"], description: "Source chain of the burn (default arc). Set baseSepolia to complete a Base->Arc burn." } }, required: ["txHash"] } },
]

export async function callExecute(base, name, args, tier) {
	tier = tier || "private"
	const clientName = tier === "demo" ? "demo" : "claude-private"
  args = args || {}
  if (!CRONUS_EXEC_SECRET) return { endpoint: "/api/mcp-private", httpStatus: 503, error: "server exec secret not configured (CRONUS_EXEC_SECRET)", _isError: true }
  if (emergencyPaused()) return { endpoint: "/api/mcp-private", httpStatus: 503, paused: true, error: pauseError().error, _isError: true }

  if (name === "cronus_swap_execute") {
		if (tier === "demo") { const g = await demoGuardSwap(base, args); if (g) return g }
    const body = { side: typeof args.side === "string" ? args.side : "usdc_to_crn", amountIn: args.amountIn, slippageBps: args.slippageBps, autoSignal: args.autoSignal !== false, execute: true, execKey: CRONUS_EXEC_SECRET }
    if (typeof args.instId === "string" && args.instId) body.instId = args.instId
    const r = await post(base, "/api/swap", body, clientName)
    const txHash = (r.body && (r.body.txHash || (r.body.result && r.body.result.txHash))) || null
    await auditExec({ ts: new Date().toISOString(), tool: name, side: body.side, amountIn: String(args.amountIn), httpStatus: r.status, executed: !!(r.body && r.body.executed === true), txHash: txHash, caller: clientName || "claude-private" })
    return { endpoint: "/api/swap", httpStatus: r.status, executed: !!(r.body && r.body.executed === true), dry_run: false, result: r.body, honest_note: "PRIVATE MCP: exec secret injected server-side from env; caller supplies no key. Real on-chain AMM swap in Cronus's own USDC/CRN pool on Arc (funds stay in-pool); verify txHash on arcscan. Server caps: 2 USDC/swap, 50/day, 1/min.", _isError: r.status >= 500 }
  }

  if (name === "cronus_bridge_execute") {
    const to = args.to
    if (!isAllowlisted(to)) return { endpoint: "/api/bridge", httpStatus: 403, error: "recipient not in Cronus treasury allowlist", allowlist: { evm: ALLOW_EVM, stellar: ALLOW_STELLAR }, _isError: true }
    if (tier === "demo") { const g = await demoGuardBridge(args); if (g) return g }
		const body = { dest: args.dest, to: to, amount: args.amount, execute: true, execKey: CRONUS_BRIDGE_EXEC_SECRET }
    if (typeof args.source === "string" && args.source) body.source = args.source
    if (typeof args.maxFee !== "undefined") body.maxFee = args.maxFee
    const r = await post(base, "/api/bridge", body, clientName)
    const txHash = (r.body && (r.body.burnTx || r.body.txHash || (r.body.result && r.body.result.burnTx))) || null
    await auditExec({ ts: new Date().toISOString(), tool: name, dest: args.dest, to: to, amount: String(args.amount), httpStatus: r.status, executed: !!(r.body && r.body.executed === true), txHash: txHash, caller: clientName || "claude-private" })
    return { endpoint: "/api/bridge", httpStatus: r.status, executed: !!(r.body && r.body.executed === true), dry_run: false, result: r.body, honest_note: "PRIVATE MCP: exec secret injected server-side from env; caller supplies no key. Recipient restricted to Cronus treasury allowlist. Real CCTP burn on Arc (verify burnTx on arcscan). Server caps: 5 USDC/bridge, shared daily breaker, 1/min.", _isError: r.status >= 500 }
  }

  if (name === "cronus_bridge_complete") {
    const txHash = args.txHash || args.tx || ""
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { endpoint: "/api/complete-evm", httpStatus: 400, error: "txHash must be 0x + 64 hex (the Arc burn tx from cronus_bridge_execute)", _isError: true }
    const qs = "?txHash=" + encodeURIComponent(txHash) + (args.dest ? "&dest=" + encodeURIComponent(args.dest) : "") + (args.source ? "&source=" + encodeURIComponent(args.source) : "")
    const cr = await fetch(base + "/api/complete-evm" + qs, { headers: { accept: "application/json", "x-mcp-client": clientName } })
    const ctext = await cr.text(); let cb; try { cb = JSON.parse(ctext) } catch (e) { cb = { raw: ctext } }
    const mintTx = (cb && (cb.mintTxHash || (cb.result && cb.result.mintTxHash))) || null
    await auditExec({ ts: new Date().toISOString(), tool: name, txHash: txHash, dest: (args.dest || (cb && cb.dest)) || null, httpStatus: cr.status, minted: !!(cb && cb.status === "success"), mintTxHash: mintTx, caller: clientName })
    return { endpoint: "/api/complete-evm", httpStatus: cr.status, minted: !!(cb && cb.status === "success"), status: cb && cb.status, result: cb, honest_note: "PRIVATE MCP: finalizes an already-burned CCTP transfer by calling MessageTransmitterV2.receiveMessage on the destination chain; moves no NEW funds (server pays only destination gas). Real mint - verify mintTxHash on the destination explorer. Idempotent per burn txHash.", _isError: cr.status >= 500 }
  }
  return { _unknown: true, error: "Unknown execute tool: " + String(name) }
}
