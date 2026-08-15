// lib/mcp.js — stateless remote MCP server (Streamable HTTP / JSON-RPC 2.0).
// Public URL via vercel.json rewrite: /api/mcp -> /api/info?kind=mcp
// Rides existing api/info.js router => ZERO extra serverless functions.
const PAY_TO = process.env.CRONUS_PAYTO || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd"
const NETWORK = process.env.X402_NETWORK || "arc-testnet"
const PROTOCOL_VERSION = "2025-06-18"

const TOOLS = [
  { name: "cronus_consult", description: "FREE Cronus market verdict for a pair on Arc (BUY/SKIP/HOLD/CACHE) with conviction, reasoning, price cross-check and a re-verifiable traceHash. No payment.", inputSchema: { type: "object", properties: { instId: { type: "string", description: "Instrument id, e.g. ETH-USDC. Defaults to ETH-USDC." } } } },
  { name: "cronus_signal", description: "Cronus premium signal, paid via x402 (0.02 USDC on Arc). Without payment returns the HTTP 402 quote to settle and retry.", inputSchema: { type: "object", properties: { instId: { type: "string", description: "Instrument id. Defaults to ETH-USDC." } } } },
  { name: "cronus_nano_signal", description: "Cronus nano signal via Circle Gateway nanopayments (~0.001 USDC). Without payment returns the 402 quote.", inputSchema: { type: "object", properties: { instId: { type: "string", description: "Instrument id. Defaults to ETH-USDC." } } } },
  { name: "cronus_pay", description: "Exact on-chain USDC payment instructions for a Cronus premium signal (x402/Circle Gateway). Returns the live 402 quote, pay-to, amount, network. Never moves funds; a payer counts as external only after on-chain confirmation (/api/receipts).", inputSchema: { type: "object", properties: { instId: { type: "string", description: "Instrument id. Defaults to ETH-USDC." } } } },
  { name: "cronus_signal_xlayer", description: "Cronus premium signal on OKX X Layer (eip155:196), paid via x402 in USDT0 (~0.02). Returns 402 quote without payment.", inputSchema: { type: "object", properties: { instId: { type: "string", description: "Instrument id, e.g. BTC-USDC." }, topic: { type: "string", description: "Market topic." } } } },
  { name: "cronus_receipts", description: "Read-only: recent Cronus x402 payment receipts (payer, amount, instId, verdict, traceHash, ts, external flag). No payment. Source of truth for who paid and whether they count as external.", inputSchema: { type: "object", properties: {} } },
  { name: "cronus_metrics", description: "Read-only: aggregate Cronus agent stats (signals, win-rate, avg conviction/EV, net USDC flow, uptime). No payment.", inputSchema: { type: "object", properties: {} } },
  { name: "cronus_leaderboard", description: "Read-only: external-payer leaderboard and volume (external_payers, total volume, top payers). Self/demo traffic is labeled separately and never counted as external. No payment.", inputSchema: { type: "object", properties: {} } },
]

function baseFrom(req) {
  const host = (req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "cronus-capital.vercel.app"
  const proto = (req.headers && req.headers["x-forwarded-proto"]) || "https"
  return proto + "://" + host
}
async function apiGet(base, path, clientName) {
  const res = await fetch(base + path, { headers: { accept: "application/json", "x-mcp-client": clientName || "mcp-client" } })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = { raw: text } }
  return { status: res.status, body }
}
async function callTool(base, name, args, clientName) {
  // >>> autosettle (self/demo): pay with our own test wallet to prove the paywall live
  if (name === "cronus_signal" || name === "cronus_nano_signal") {
    try {
      const _s = await import("./settle.js")
      if (_s.autosettleEnabled()) {
        const settled = await _s.settlePaidTool(base, name, args)
        if (settled) return settled
      }
    } catch (e) { /* fall back to normal 402-quote behavior */ }
  }
  // <<< autosettle
  args = args || {}
  const instId = typeof args.instId === "string" && args.instId ? args.instId : "ETH-USDC"
  if (name === "cronus_signal_xlayer") {
    const topic = typeof args.topic === "string" && args.topic ? args.topic : instId + " momentum"
    const path = "/api/signal-x402?topic=" + encodeURIComponent(topic) + "&instId=" + encodeURIComponent(instId)
    const r = await apiGet(base, path, clientName)
    return { endpoint: path, httpStatus: r.status, payment_required: r.status === 402, network: "eip155:196", asset: "USDT0", quote: r.body, _isError: r.status >= 500 }
  }
  if (name === "cronus_pay" || name === "pay") {
    const path = "/api/signal?instId=" + encodeURIComponent(instId)
    const r = await apiGet(base, path, clientName)
    return { endpoint: path, httpStatus: r.status, payment_required: r.status === 402, pay_to: PAY_TO, network: NETWORK, asset: "USDC", quote: r.body, how_to_pay: ["1. Settle the quoted USDC amount on Arc to pay_to via an x402 wallet.", "2. Retry cronus_signal with the paid x402 client.", "3. Settlement is recorded on-chain at /api/receipts."], honest_note: "Cronus never fabricates demand. Payment counts as external only after on-chain confirmation; self-generated test traffic stays labeled separately.", _isError: r.status >= 500 }
  }
  const READONLY = { cronus_receipts: "/api/receipts", cronus_metrics: "/api/metrics", cronus_leaderboard: "/api/leaderboard" }
  if (READONLY[name]) {
    const path = READONLY[name]
    const r = await apiGet(base, path, clientName)
    return { endpoint: path, httpStatus: r.status, result: r.body, _isError: r.status >= 500 }
  }
  const map = { cronus_consult: "/api/consult", cronus_signal: "/api/signal", cronus_nano_signal: "/api/nano-signal" }
  const route = map[name]
  if (!route) return { _unknown: true, error: "Unknown tool: " + String(name) }
  const path = route + "?instId=" + encodeURIComponent(instId)
  const r = await apiGet(base, path, clientName)
  const payload = { endpoint: path, httpStatus: r.status, paymentRequired: r.status === 402, result: r.body, _isError: r.status >= 500 }
  if (r.status === 402) payload.note = "Payment required (x402). Pay the quoted USDC on Arc, then retry with a paid x402 client."
  return payload
}
function ok(id, result) { return { jsonrpc: "2.0", id, result } }
function errObj(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } } }
async function handleOne(base, msg) {
  if (!msg || typeof msg !== "object") return null
  const id = msg.id, method = msg.method, params = msg.params || {}
  const isNotification = (id === undefined || id === null)
  if (method === "initialize") {
    const clientName = params.clientInfo && params.clientInfo.name ? params.clientInfo.name : "mcp-client"
    fetch(base + "/api/nano-signal?handshake=1&client=" + encodeURIComponent(clientName)).catch(() => {})
    return ok(id, { protocolVersion: params.protocolVersion || PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "cronus-mcp", version: "0.2.0" }, instructions: "Cronus Capital: on-chain x402-paid market signals on Arc. Free: cronus_consult. Paid via x402/Circle Gateway: cronus_signal, cronus_nano_signal, cronus_signal_xlayer. cronus_pay returns payment instructions. Read-only status tools (no payment): cronus_receipts, cronus_metrics, cronus_leaderboard." })
  }
  if (method === "tools/list") return ok(id, { tools: TOOLS })
  if (method === "tools/call") {
    const out = await callTool(base, params.name, params.arguments || {}, "mcp-client")
    if (out._unknown) return errObj(id, -32602, out.error)
    const isError = out._isError === true
    delete out._isError; delete out._unknown
    return ok(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], isError })
  }
  if (method === "ping") return ok(id, {})
  if (isNotification) return null
  return errObj(id, -32601, "Method not found: " + String(method))
}
export default async function mcp(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Headers", "content-type, mcp-session-id, mcp-protocol-version, authorization, accept")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id")
  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method === "GET") return res.status(405).json(errObj(null, -32000, "Stateless MCP endpoint; use POST JSON-RPC."))
  if (req.method !== "POST") return res.status(405).end()
  const base = baseFrom(req)
  let msg = req.body
  if (msg === undefined || msg === null || msg === "") {
    try { const chunks = []; for await (const c of req) chunks.push(c); const raw = Buffer.concat(chunks).toString("utf8"); msg = raw ? JSON.parse(raw) : null } catch { msg = null }
  } else if (typeof msg === "string") { try { msg = JSON.parse(msg) } catch { msg = null } }
  if (msg == null) return res.status(400).json(errObj(null, -32700, "Parse error"))
  const isBatch = Array.isArray(msg)
  const inputs = isBatch ? msg : [msg]
  const responses = []
  for (const one of inputs) { const r = await handleOne(base, one); if (r) responses.push(r) }
  if (responses.length === 0) return res.status(202).end()
  res.setHeader("Content-Type", "application/json")
  return res.status(200).json(isBatch ? responses : responses[0])
}
