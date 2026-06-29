// lib/gateway.js — Gateway settlement resolver (ADDITIVE, read-only).
// Honestly maps payments to on-chain settlements. No fabricated hashes:
// unavailable/batched mappings are returned as null/labeled.
//   - x402-exact:            direct USDC transfer payer -> treasury (1:1, verifiable on arcscan)
//   - circle-gateway-batched: real on-chain footprint of GatewayWallet (burn + settle via attestation)
//   - transferId lookup:     real Circle facilitator call when CIRCLE_GATEWAY_API_KEY is configured

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const USDC = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase()
const TREASURY = (process.env.CRONUS_PAYTO || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd").toLowerCase()
const GATEWAY_WALLET = (process.env.GATEWAY_WALLET || "0x0077777d7eba4688bdef3e311b846f25870a19b9").toLowerCase()
const FAC = process.env.GATEWAY_FACILITATOR_URL || "https://gateway-api-testnet.circle.com"
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const EXPLORER_TX = "https://testnet.arcscan.app/tx/"
const RANGE = 10000

const pad = (a) => "0x000000000000000000000000" + a.toLowerCase().replace(/^0x/, "")
const hx = (n) => "0x" + n.toString(16)
const isZero = (a) => /^0x0+$/.test(a)

async function rpc(method, params) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })
  const j = await r.json()
  if (j.error) throw new Error(method + ": " + JSON.stringify(j.error))
  return j.result
}

async function scan(topics, windows) {
  const latest = parseInt(await rpc("eth_blockNumber", []), 16)
  const out = []
  for (let i = 0; i < windows; i++) {
    const to = latest - i * RANGE
    if (to < 0) break
    const fr = Math.max(0, to - (RANGE - 1))
    let logs
    try { logs = await rpc("eth_getLogs", [{ address: USDC, topics, fromBlock: hx(fr), toBlock: hx(to) }]) } catch (e) { continue }
    if (Array.isArray(logs)) for (const l of logs) out.push({
      txHash: l.transactionHash,
      block: parseInt(l.blockNumber, 16),
      from: "0x" + l.topics[1].slice(26),
      to: "0x" + l.topics[2].slice(26),
      amountUsdc: parseInt(l.data, 16) / 1e6,
    })
  }
  return { latest, logs: out }
}

export async function resolveDirectSettlements(windows) {
  const { latest, logs } = await scan([TRANSFER_TOPIC, null, pad(TREASURY)], windows)
  const settlements = logs
    .filter((l) => l.from.toLowerCase() !== GATEWAY_WALLET && l.from.toLowerCase() !== TREASURY)
    .map((l) => ({ txHash: l.txHash, block: l.block, payer: l.from, amountUsdc: l.amountUsdc, rail: "x402-exact", explorer: EXPLORER_TX + l.txHash }))
    .sort((a, b) => b.block - a.block)
  return {
    rail: "x402-exact",
    mapping: "1:1-onchain",
    chainTip: latest,
    windowBlocks: windows * RANGE,
    count: settlements.length,
    totalUsdc: Number(settlements.reduce((s, x) => s + x.amountUsdc, 0).toFixed(6)),
    settlements: settlements.slice(0, 50),
  }
}

export async function resolveGatewayFootprint(windows) {
  const { latest, logs } = await scan([TRANSFER_TOPIC, pad(GATEWAY_WALLET)], windows)
  const burns = logs.filter((l) => isZero(l.to))
  const settles = logs.filter((l) => !isZero(l.to))
  const recip = {}
  for (const l of settles) recip[l.to] = (recip[l.to] || 0) + 1
  return {
    rail: "circle-gateway-batched",
    mapping: "net-batched",
    note: "Real on-chain footprint of Circle Gateway settlement from the GatewayWallet (burn + mint via attestation). A single nano-payment UUID does NOT map 1:1 to one on-chain tx on Arc testnet: Gateway nets positions and settles in batches. Per-transfer facilitator status requires Circle API credentials (see transferLookup).",
    chainTip: latest,
    windowBlocks: windows * RANGE,
    gatewayWallet: GATEWAY_WALLET,
    onchainSettleTransfers: settles.length,
    onchainBurns: burns.length,
    topRecipients: Object.entries(recip).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([addr, n]) => ({ addr, count: n })),
    samples: settles.slice(0, 5).map((l) => ({ txHash: l.txHash, to: l.to, amountUsdc: l.amountUsdc, explorer: EXPLORER_TX + l.txHash })),
  }
}

export async function resolveTransferById(id) {
  const url = FAC.replace(/\/$/, "") + "/v1/x402/transfers/" + encodeURIComponent(id)
  const key = process.env.CIRCLE_GATEWAY_API_KEY || process.env.CIRCLE_API_KEY
  if (!key) return { resolved: false, id, lookupUrl: url, reason: "facilitator auth not configured; per-transfer Gateway status requires Circle API credentials" }
  try {
    const r = await fetch(url, { headers: { authorization: "Bearer " + key } })
    const body = await r.json().catch(() => null)
    return { resolved: r.ok, id, status: r.status, transfer: r.ok ? body : null, error: r.ok ? null : body }
  } catch (e) {
    return { resolved: false, id, lookupUrl: url, error: String((e && e.message) || e) }
  }
}

export async function resolveSettlements(opts) {
  const windows = Math.min(Math.max(parseInt((opts && opts.windows) || 6, 10) || 6, 1), 24)
  const [direct, gateway] = await Promise.all([resolveDirectSettlements(windows), resolveGatewayFootprint(windows)])
  const out = {
    ok: true,
    resolver: "cronus-gateway-settlement",
    generatedAt: new Date().toISOString(),
    treasury: TREASURY,
    usdc: USDC,
    rails: { directOnchain: direct, gatewayBatched: gateway },
    honesty: "On-chain settlements are real and verifiable on arcscan; no hash is fabricated. Batched/unavailable mappings are labeled and null. External vs self-generated payers are reported by /api/traction.",
  }
  if (opts && opts.transferId) out.transferLookup = await resolveTransferById(opts.transferId)
  return out
}

// Default export: Vercel-style (req,res) handler. Routed via /api/info?kind=settlements.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  try {
    const q = (req && req.query) || {}
    const out = await resolveSettlements({ windows: q.windows, transferId: q.transferId })
    return res.status(200).json(out)
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) })
  }
}
