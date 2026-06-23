// api/receipts.js - public, verifiable x402 receipts for Cronus.
// Lists real USDC payments to PAY_TO (value == signal price) from the Arc explorer,
// and enriches the two hero proofs with their on-chain commitment + memoId.
const USDC = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase()
const PAY_TO = (process.env.CRONUS_PAYTO || "0xdc6778C5F8cC74b10aED11c48306D4Cfc5737FBD").toLowerCase()
const PRICE = String(process.env.SIGNAL_PRICE || "20000")
const EXPLORER = process.env.ARC_EXPLORER || "https://testnet.arcscan.app"
const KNOWN = {
  "0xfe2764b2b837365ea7cb896fbbe55119ffbf250e51941945bf013a88bb942086": { kind: "x402-signal", commitment: "0x993453223b57849b38df20ff050daa54905d53a3ac70c56c8e5460eb6fa77611", memoId: null },
  "0xa7a0e3b25394d2c0570be62605f0a379b1a0e5d1ba2e7607f719fbd1ca9943d5": { kind: "x402-signal-memo", commitment: "0xc9acbd88b845a248e3ee669cca257f2e64f8c1daf17f64063d7765bfeae60680", memoId: "0x30c32e7e09b43cee3059b3d8136b591fda8c61d7840cff45911c60ee04e19d46" },
}
async function fetchExplorer() {
  const u = EXPLORER + "/api?module=account&action=tokentx&address=" + PAY_TO + "&contractaddress=" + USDC + "&page=1&offset=10000&sort=desc"
  const r = await fetch(u, { headers: { accept: "application/json" } })
  const j = await r.json()
  if (!j || !Array.isArray(j.result)) throw new Error("explorer: no result array")
  return j.result
}
function buildReceipt(tx) {
  const hash = String(tx.hash).toLowerCase()
  const k = KNOWN[hash] || {}
  const atomic = Number(tx.value)
  return {
    txHash: tx.hash,
    kind: k.kind || "x402-signal",
    asset: "USDC",
    payTo: PAY_TO,
    payer: String(tx.from || "").toLowerCase(),
    amountAtomic: atomic,
    amountUsdc: atomic / 1000000,
    block: tx.blockNumber ? Number(tx.blockNumber) : null,
    settledAt: tx.timeStamp ? new Date(Number(tx.timeStamp) * 1000).toISOString() : null,
    settled: true,
    commitment: k.commitment || null,
    memoId: k.memoId || null,
    explorer: EXPLORER + "/tx/" + tx.hash,
    source: "onchain-receipt",
  }
}
export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*")
  res.setHeader("access-control-allow-methods", "GET, OPTIONS")
  if (req.method === "OPTIONS") { res.status(204).end(); return }
  try {
    let receipts = []
    try {
      const rows = await fetchExplorer()
      const seen = new Set()
      for (const tx of rows) {
        if (String(tx.to || "").toLowerCase() !== PAY_TO) continue
        if (String(tx.contractAddress || "").toLowerCase() !== USDC) continue
        if (String(tx.value) !== PRICE) continue
        const h = String(tx.hash).toLowerCase()
        if (seen.has(h)) continue
        seen.add(h)
        receipts.push(buildReceipt(tx))
      }
    } catch (e) { /* explorer down -> KNOWN-only below */ }
    const present = new Set(receipts.map(r => String(r.txHash).toLowerCase()))
    for (const hash of Object.keys(KNOWN)) {
      if (!present.has(hash)) {
        const k = KNOWN[hash]
        receipts.push({ txHash: hash, kind: k.kind, asset: "USDC", payTo: PAY_TO, payer: null, amountAtomic: Number(PRICE), amountUsdc: Number(PRICE) / 1000000, block: null, settledAt: null, settled: true, commitment: k.commitment || null, memoId: k.memoId || null, explorer: EXPLORER + "/tx/" + hash, source: "static" })
      }
    }
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
