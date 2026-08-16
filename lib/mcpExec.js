// lib/mcpExec.js — PRIVATE MCP execute layer (auth-gated, server-side exec secret).
// Loaded by lib/mcp.js only when kind=mcp-private. Zero extra serverless functions.

const MCP_PRIVATE_TOKEN = process.env.MCP_PRIVATE_TOKEN || ""
const CRONUS_EXEC_SECRET = process.env.CRONUS_EXEC_SECRET || ""
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ""
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ""

// Cronus treasury-owned addresses — bridge execute may ONLY send here.
const ALLOW_EVM = ["0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd"].map(function (s) { return s.toLowerCase() })
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

export function isPrivateAuthorized(req) {
  if (!MCP_PRIVATE_TOKEN) return false
  const t = readPrivateToken(req)
  return t.length > 0 && t === MCP_PRIVATE_TOKEN
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

export const PRIVATE_EXECUTE_TOOLS = [
  { name: "cronus_swap_execute", description: "PRIVATE (auth-gated): execute a REAL on-chain swap in Cronus's own USDC/CRN AMM on Arc. The server injects the Cronus exec secret from its own env; the caller never supplies a key. Funds stay inside Cronus's own pool (no external recipient). Server-enforced caps: 2 USDC/swap, 50/day, treasury-signed, 1/min.", inputSchema: { type: "object", properties: { side: { type: "string", enum: ["usdc_to_crn", "crn_to_usdc"], description: "Swap direction. Default usdc_to_crn." }, amountIn: { type: "string", description: "Input amount in atomic units (6dp), e.g. 100000 = 0.1 USDC." }, slippageBps: { type: "number", description: "Max slippage in bps (default 100)." }, autoSignal: { type: "boolean", description: "If true (default), gate on a live Cronus signal (conviction >= 65)." }, instId: { type: "string", description: "Instrument id for the optional signal gate, e.g. BTC-USDC." } }, required: ["side", "amountIn"] } },
  { name: "cronus_bridge_execute", description: "PRIVATE (auth-gated): execute a REAL CCTP bridge burn of Cronus treasury USDC on Arc. The server injects the Cronus exec secret from its own env; the caller never supplies a key. Recipient MUST be a Cronus treasury-owned allowlisted address (funds only move between Cronus's own wallets); any other recipient is rejected with 403. Server-enforced caps: 5 USDC/bridge, shared daily breaker, 1/min.", inputSchema: { type: "object", properties: { dest: { type: "string", enum: ["stellar", "baseSepolia", "sepolia", "arbitrumSepolia"], description: "Destination: stellar or an EVM chain name." }, to: { type: "string", description: "Recipient — MUST be a Cronus treasury allowlisted address (Stellar G-address for stellar, else the treasury 0x address)." }, amount: { type: "string", description: "Amount in USDC (decimal), e.g. 1.0." }, maxFee: { type: "string", description: "Optional max CCTP fee in USDC; default amount/100." } }, required: ["dest", "to", "amount"] } },
]

export async function callExecute(base, name, args, clientName) {
  args = args || {}
  if (!CRONUS_EXEC_SECRET) return { endpoint: "/api/mcp-private", httpStatus: 503, error: "server exec secret not configured (CRONUS_EXEC_SECRET)", _isError: true }

  if (name === "cronus_swap_execute") {
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
    const body = { dest: args.dest, to: to, amount: args.amount, execute: true, execKey: CRONUS_EXEC_SECRET }
    if (typeof args.maxFee !== "undefined") body.maxFee = args.maxFee
    const r = await post(base, "/api/bridge", body, clientName)
    const txHash = (r.body && (r.body.burnTx || r.body.txHash || (r.body.result && r.body.result.burnTx))) || null
    await auditExec({ ts: new Date().toISOString(), tool: name, dest: args.dest, to: to, amount: String(args.amount), httpStatus: r.status, executed: !!(r.body && r.body.executed === true), txHash: txHash, caller: clientName || "claude-private" })
    return { endpoint: "/api/bridge", httpStatus: r.status, executed: !!(r.body && r.body.executed === true), dry_run: false, result: r.body, honest_note: "PRIVATE MCP: exec secret injected server-side from env; caller supplies no key. Recipient restricted to Cronus treasury allowlist. Real CCTP burn on Arc (verify burnTx on arcscan). Server caps: 5 USDC/bridge, shared daily breaker, 1/min.", _isError: r.status >= 500 }
  }

  return { _unknown: true, error: "Unknown execute tool: " + String(name) }
}
