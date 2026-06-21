// api/metrics.js - live on-chain traction for Cronus x402 payments.
// Counts USDC Transfer events to PAY_TO on Arc testnet (real settlement volume).
// Falls back to known proof txs if log scan is unavailable.

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const USDC = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase()
const PAY_TO = (process.env.CRONUS_PAYTO || "0xdc6778C5F8cC74b10aED11c48306D4Cfc5737FBD").toLowerCase()
const RPC_URLS = ["https://rpc.testnet.arc.network", process.env.SIGNAL_RPC_URL, process.env.VITE_RPC_URL, process.env.RPC_URL].filter(Boolean)
const WINDOW = BigInt(process.env.METRICS_BLOCK_WINDOW || "2000000")

const KNOWN = [
  "0xa7a0e3b25394d2c0570be62605f0a379b1a0e5d1ba2e7607f719fbd1ca9943d5",
  "0xfe2764b2b837365ea7cb896fbbe55119ffbf250e51941945bf013a88bb942086",
]

async function rpc(method, params) {
  let lastErr
  for (const u of RPC_URLS) {
    try {
      const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })
      const t = await r.text()
      let j
      try { j = JSON.parse(t) } catch { continue }
      if (j.error) { lastErr = new Error(method + ": " + JSON.stringify(j.error)); continue }
      return j.result
    } catch (e) { lastErr = e }
  }
  throw lastErr || new Error("all RPCs failed")
}

const pad32 = (addr) => "0x" + "0".repeat(24) + addr.replace(/^0x/, "").toLowerCase()
const topicToAddress = (t) => "0x" + t.slice(26).toLowerCase()

async function scanLogs() {
  const latest = BigInt(await rpc("eth_blockNumber", []))
  const fromBlock = latest > WINDOW ? latest - WINDOW : 0n
  const logs = await rpc("eth_getLogs", [{
    fromBlock: "0x" + fromBlock.toString(16),
    toBlock: "latest",
    address: USDC,
    topics: [TRANSFER_TOPIC, null, pad32(PAY_TO)],
  }])
  let total = 0n, lastTx = null, lastBlock = 0n
  for (const log of logs) {
    total += BigInt(log.data)
    const b = BigInt(log.blockNumber)
    if (b >= lastBlock) { lastBlock = b; lastTx = log.transactionHash }
  }
  return { source: "onchain-logs", payments: logs.length, totalAtomic: total.toString(), lastTx }
}

async function scanKnown() {
  let total = 0n, payments = 0, lastTx = null
  for (const h of KNOWN) {
    const rec = await rpc("eth_getTransactionReceipt", [h])
    if (!rec || rec.status !== "0x1") continue
    for (const log of rec.logs || []) {
      if ((log.address || "").toLowerCase() !== USDC) continue
      if (!log.topics || (log.topics[0] || "").toLowerCase() !== TRANSFER_TOPIC) continue
      if (topicToAddress(log.topics[2]) !== PAY_TO) continue
      total += BigInt(log.data); payments += 1; lastTx = h
    }
  }
  return { source: "known-proofs", payments, totalAtomic: total.toString(), lastTx }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300")
  try {
    let data
    try { data = await scanLogs() } catch { data = await scanKnown() }
    if (!data || data.payments === 0) {
      try { const k = await scanKnown(); if (k.payments > 0) data = k } catch (e) { /* keep */ }
    }
    const totalUsdc = Number(BigInt(data.totalAtomic)) / 1e6
    res.status(200).json({
      ok: true,
      network: process.env.X402_NETWORK || "arc-testnet",
      asset: "USDC",
      payTo: PAY_TO,
      payments: data.payments,
      totalUsdc: Number(totalUsdc.toFixed(6)),
      lastTx: data.lastTx,
      explorer: data.lastTx ? ("https://testnet.arcscan.app/tx/" + data.lastTx) : null,
      source: data.source,
      updatedAt: new Date().toISOString(),
    })
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e && e.message) || e) })
  }
}
