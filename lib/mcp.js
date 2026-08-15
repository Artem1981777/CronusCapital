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
  { name: "cronus_balance", description: "Read-only: Cronus treasury balances on Arc testnet (USDC token balance, native gas balance, treasury address, last payout time). No payment, never moves funds.", inputSchema: { type: "object", properties: {} } },
  { name: "cronus_payout_status", description: "Read-only: autonomous payout-agent status (enabled, available USDC, last run time, total payouts, last payout amount, decision count, hash-chain tip). No payment.", inputSchema: { type: "object", properties: {} } },
  { name: "cronus_decisions", description: "Read-only: on-chain decision log from CronusDecisions (Arc testnet). Recent decisions with action, confidence, agent role, on-chain timestamp, and a short sha256 trace hash re-verifiable at /api/trace. Oracle is the self-operated demo agent wallet (labeled). No payment.", inputSchema: { type: "object", properties: {} } },
  { name: "cronus_insurance_quote", description: "FREE quote for Cronus signal insurance on a pair (Arc testnet). Given notional, returns premium (5%), money-back payout if MISS, coverage window, current conviction and reserve. No payment.", inputSchema: { type: "object", properties: { instId: { type: "string", description: "Instrument id, e.g. ETH-USDC." }, notional: { type: "number", description: "Position notional in USDC to insure." }, topic: { type: "string", description: "Market topic. Defaults to <instId> momentum." } } } },
  { name: "cronus_insurance_buy", description: "Buy Cronus signal insurance, paid via x402 (premium = 5% of notional in USDC on Arc). Without payment returns the HTTP 402 quote. Never moves funds via MCP; premium is verified on-chain on buy. Money-back if conviction < 50 within 24h.", inputSchema: { type: "object", properties: { instId: { type: "string", description: "Instrument id." }, notional: { type: "number", description: "Position notional in USDC to insure." }, topic: { type: "string", description: "Market topic." } } } },
  { name: "cronus_insurance_status", description: "Read-only: status of a Cronus insurance policy by policy_id. Checks the on-chain decision log (/api/decisions) for a MISS (conviction < 50 within coverage) and reflects a full-premium refund. No payment.", inputSchema: { type: "object", properties: { policy_id: { type: "string", description: "Policy id returned by cronus_insurance_buy." } } } },
  { name: "cronus_vault", description: "Read-only: Cronus vault NAV on Arc testnet (ERC-4626 totalAssets read). Returns vault address, latest and first NAV in USDC, sample count, and recent on-chain NAV snapshots. NAV is read live on-chain; synthetic yield accrual is disabled and the series is never backfilled or fabricated. No payment, never moves funds.", inputSchema: { type: "object", properties: {} } },
  { name: "cronus_cctp_status", description: "Read-only: Circle CCTP v2 cross-chain attestation status for an Arc (source domain 26) burn txHash, resolved via Circle IRIS. Bridge route Arc -> Stellar (Soroban). Returns attestation ready/pending/not_found. Never mints or moves funds. No payment. Omit txHash for route info.", inputSchema: { type: "object", properties: { txHash: { type: "string", description: "Arc burn txHash (0x + 64 hex). Omit to get CCTP route info." } } } },
  { name: "cronus_identity", description: "Read-only: ERC-8004 on-chain agent identity from CronusIdentityRegistry on Arc testnet. Resolves the Cronus agent (agentId 1 by default) or any agentId/address, returning agentAddress, domain, metadataURI, owner and timestamps. Live on-chain read via viem; never writes or moves funds. No payment.", inputSchema: { type: "object", properties: { agentId: { type: "number", description: "Agent id to resolve (default 1)." }, address: { type: "string", description: "Resolve by agent address (0x + 40 hex) instead of id." } } } },
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
  if (name === "cronus_insurance_quote" || name === "cronus_insurance_buy" || name === "cronus_insurance_status") {
    const topic = typeof args.topic === "string" && args.topic ? args.topic : instId + " momentum"
    if (name === "cronus_insurance_status") {
      const pid = typeof args.policy_id === "string" ? args.policy_id : (typeof args.id === "string" ? args.id : "")
      const path = "/api/insurance-status?policy_id=" + encodeURIComponent(pid)
      const r = await apiGet(base, path, clientName)
      return { endpoint: path, httpStatus: r.status, result: r.body, _isError: r.status >= 500 }
    }
    const notional = Number(args.notional || 0)
    if (name === "cronus_insurance_quote") {
      const path = "/api/insurance-quote?instId=" + encodeURIComponent(instId) + "&topic=" + encodeURIComponent(topic) + "&notional=" + encodeURIComponent(String(notional))
      const r = await apiGet(base, path, clientName)
      return { endpoint: path, httpStatus: r.status, result: r.body, _isError: r.status >= 500 }
    }
    const path = "/api/insurance-buy?instId=" + encodeURIComponent(instId) + "&topic=" + encodeURIComponent(topic) + "&notional=" + encodeURIComponent(String(notional))
    const r = await apiGet(base, path, clientName)
    return { endpoint: path, httpStatus: r.status, payment_required: r.status === 402, pay_to: PAY_TO, network: NETWORK, asset: "USDC", quote: r.body, how_to_pay: ["1. Pay the quoted premium (maxAmountRequired) USDC on Arc to pay_to via an x402 wallet.", "2. POST /api/insurance-buy with same instId/topic/notional and header X-PAYMENT: <txHash>.", "3. Check cronus_insurance_status to claim if Cronus is wrong."], honest_note: "MCP never moves funds; only returns the x402 quote. Premium verified on-chain on buy. Testnet demo; refunds honored from self-operated treasury.", _isError: r.status >= 500 }
  }
  if (name === "cronus_vault") {
    const path = "/api/vault-nav"
    const r = await apiGet(base, path, clientName)
    const b = r.body || {}
    const snaps = Array.isArray(b.snapshots) ? b.snapshots : []
    const latest = snaps.length ? snaps[snaps.length - 1] : null
    const first = snaps.length ? snaps[0] : null
    return { endpoint: path, httpStatus: r.status, result: { ok: b.ok, vault: b.vault, standard: "ERC-4626 (totalAssets read)", asset: "USDC", decimals: 6, count: b.count, recorded: b.recorded, degraded: b.degraded, latest_nav_usdc: latest ? latest.nav : null, latest_ts: latest ? latest.ts : null, first_nav_usdc: first ? first.nav : null, first_ts: first ? first.ts : null, recent: snaps.slice(-12), explorer: "https://testnet.arcscan.app/address/" + (b.vault || ""), note: b.note, synthetic_yield: "disabled (NAV read live on-chain; never backfilled or fabricated)" }, _isError: r.status >= 500 }
  }
  if (name === "cronus_cctp_status") {
    const txHash = typeof args.txHash === "string" && args.txHash ? args.txHash : ""
    const path = "/api/cctp-status" + (txHash ? "?txHash=" + encodeURIComponent(txHash) : "")
    const r = await apiGet(base, path, clientName)
    return { endpoint: path, httpStatus: r.status, result: r.body, _isError: r.status >= 500 }
  }
  if (name === "cronus_identity") {
    const addr = typeof args.address === "string" && args.address ? args.address : ""
    const agentId = args.agentId != null && args.agentId !== "" ? String(args.agentId) : ""
    let path = "/api/identity"
    if (addr) path += "?address=" + encodeURIComponent(addr)
    else if (agentId) path += "?agentId=" + encodeURIComponent(agentId)
    const r = await apiGet(base, path, clientName)
    return { endpoint: path, httpStatus: r.status, result: r.body, _isError: r.status >= 500 }
  }
  const READONLY = { cronus_receipts: "/api/receipts", cronus_metrics: "/api/metrics", cronus_leaderboard: "/api/leaderboard", cronus_balance: "/api/balance", cronus_payout_status: "/api/payout-status", cronus_decisions: "/api/decisions" }
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
