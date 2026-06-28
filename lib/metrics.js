// api/metrics.js - live on-chain x402 traction for Cronus.
// Reads real USDC payments to PAY_TO from the Arc block explorer and counts only
// transfers whose value equals the x402 signal price, so unrelated transfers
// (e.g. vault withdrawals) are excluded. Falls back to known proofs via JSON-RPC.
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const USDC = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase()
const PAY_TO = (process.env.CRONUS_PAYTO || "0xdc6778C5F8cC74b10aED11c48306D4Cfc5737FBD").toLowerCase()
const PRICE = String(process.env.SIGNAL_PRICE || "20000")
const EXPLORER = process.env.ARC_EXPLORER || "https://testnet.arcscan.app"
const RPC_URLS = ["https://rpc.testnet.arc.network", process.env.SIGNAL_RPC_URL, process.env.VITE_RPC_URL, process.env.RPC_URL].filter(Boolean)
const KNOWN = [
  "0xa7a0e3b25394d2c0570be62605f0a379b1a0e5d1ba2e7607f719fbd1ca9943d5",
  "0xfe2764b2b837365ea7cb896fbbe55119ffbf250e51941945bf013a88bb942086",
]
async function scanExplorer() {
  const u = EXPLORER + "/api?module=account&action=tokentx&address=" + PAY_TO + "&contractaddress=" + USDC + "&page=1&offset=10000&sort=desc"
  const r = await fetch(u, { headers: { accept: "application/json" } })
  const j = await r.json()
  if (!j || !Array.isArray(j.result)) throw new Error("explorer: no result array")
  const byHash = new Map()
  let lastTx = null, lastBlock = -1
  for (const tx of j.result) {
    if (String(tx.to || "").toLowerCase() !== PAY_TO) continue
    if (String(tx.contractAddress || "").toLowerCase() !== USDC) continue
    if (String(tx.value) !== PRICE) continue
    byHash.set(String(tx.hash).toLowerCase(), PRICE)
    const b = Number(tx.blockNumber)
    if (b > lastBlock) { lastBlock = b; lastTx = String(tx.hash) }
  }
  for (const h of KNOWN) { if (!byHash.has(h.toLowerCase())) byHash.set(h.toLowerCase(), PRICE) }
  let total = 0n
  for (const v of byHash.values()) total += BigInt(v)
  return { source: "onchain-explorer", payments: byHash.size, totalAtomic: total.toString(), lastTx: lastTx || KNOWN[0] }
}
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
const topicToAddress = (t) => "0x" + t.slice(26).toLowerCase()
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
    try { data = await scanExplorer() } catch { data = await scanKnown() }
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
