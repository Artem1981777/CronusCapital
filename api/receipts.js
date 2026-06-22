const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const USDC = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase()
const PAY_TO = (process.env.CRONUS_PAYTO || "0xdc6778C5F8cC74b10aED11c48306D4Cfc5737FBD").toLowerCase()
const RPC_URLS = ["https://rpc.testnet.arc.network", process.env.SIGNAL_RPC_URL, process.env.VITE_RPC_URL, process.env.RPC_URL].filter(Boolean)
const EXPLORER = "https://testnet.arcscan.app"

const KNOWN = [
  { txHash: "0xfe2764b2b837365ea7cb896fbbe55119ffbf250e51941945bf013a88bb942086", kind: "x402-signal", commitment: "0x993453223b57849b38df20ff050daa54905d53a3ac70c56c8e5460eb6fa77611", memoId: null },
  { txHash: "0xa7a0e3b25394d2c0570be62605f0a379b1a0e5d1ba2e7607f719fbd1ca9943d5", kind: "x402-signal-memo", commitment: "0xc9acbd88b845a248e3ee669cca257f2e64f8c1daf17f64063d7765bfeae60680", memoId: "0x30c32e7e09b43cee3059b3d8136b591fda8c61d7840cff45911c60ee04e19d46" }
]

async function rpc(method, params) {
  let lastErr
  for (const u of RPC_URLS) {
    try {
      const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) })
      const t = await r.text()
      let j
      try { j = JSON.parse(t) } catch (e) { throw new Error("bad json from rpc") }
      if (j && j.result !== undefined) return j.result
      if (j && j.error) throw new Error((j.error && j.error.message) || "rpc error")
    } catch (e) { lastErr = e }
  }
  throw lastErr || new Error("all rpc endpoints failed")
}

function pad32(addr) { return "0x000000000000000000000000" + String(addr).toLowerCase().replace(/^0x/, "") }
function topicToAddress(t) { return "0x" + String(t || "").slice(-40) }

async function enrich(entry) {
  const base = { txHash: entry.txHash, kind: entry.kind, asset: "USDC", payTo: PAY_TO, payer: null, amountAtomic: null, amountUsdc: 0.02, block: null, settled: true, commitment: entry.commitment || null, memoId: entry.memoId || null, explorer: EXPLORER + "/tx/" + entry.txHash, source: "static" }
  try {
    const r = await rpc("eth_getTransactionReceipt", [entry.txHash])
    if (!r) return base
    base.settled = String(r.status) === "0x1"
    base.block = r.blockNumber ? parseInt(r.blockNumber, 16) : null
    const want = pad32(PAY_TO)
    const logs = Array.isArray(r.logs) ? r.logs : []
    for (const lg of logs) {
      const addr = String(lg.address || "").toLowerCase()
      const topics = Array.isArray(lg.topics) ? lg.topics : []
      if (addr === USDC && topics[0] === TRANSFER_TOPIC && String(topics[2] || "").toLowerCase() === want) {
        const atomic = parseInt(lg.data, 16)
        base.amountAtomic = atomic
        base.amountUsdc = atomic / 1000000
        base.payer = topicToAddress(topics[1])
        break
      }
    }
    base.source = "onchain-receipt"
    return base
  } catch (e) { return base }
}

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*")
  res.setHeader("access-control-allow-methods", "GET, OPTIONS")
  if (req.method === "OPTIONS") { res.status(204).end(); return }
  try {
    const receipts = []
    for (const e of KNOWN) { receipts.push(await enrich(e)) }
    let totalUsdc = 0
    for (const r of receipts) { totalUsdc += Number(r.amountUsdc || 0) }
    totalUsdc = Math.round(totalUsdc * 1000000) / 1000000
    const fmt = (req.query && req.query.format) ? String(req.query.format) : ""
    if (fmt === "csv") {
      const head = ["txHash", "kind", "asset", "payTo", "payer", "amountUsdc", "block", "settled", "commitment", "memoId", "explorer"]
      const lines = [head.join(",")]
      for (const r of receipts) {
        const row = [r.txHash, r.kind, r.asset, r.payTo, r.payer || "", r.amountUsdc, r.block || "", r.settled, r.commitment || "", r.memoId || "", r.explorer]
        lines.push(row.join(","))
      }
      res.setHeader("content-type", "text/csv; charset=utf-8")
      res.setHeader("content-disposition", "attachment; filename=cronus-receipts.csv")
      res.status(200).send(lines.join("\n"))
      return
    }
    res.setHeader("content-type", "application/json")
    res.setHeader("cache-control", "s-maxage=60, stale-while-revalidate=300")
    res.status(200).json({ ok: true, network: "arc-testnet", asset: "USDC", payTo: PAY_TO, count: receipts.length, totalUsdc: totalUsdc, receipts: receipts, updatedAt: new Date().toISOString() })
  } catch (e) {
    res.setHeader("content-type", "application/json")
    res.status(200).json({ ok: false, error: String((e && e.message) || e), payTo: PAY_TO, receipts: [] })
  }
}
