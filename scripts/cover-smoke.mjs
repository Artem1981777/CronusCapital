import handler from "../lib/cover.js"
function mock(q, method = "GET", body) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.code = c; return this }, json(o) { console.log("HTTP", this.code, JSON.stringify(o, null, 2).slice(0, 1200)); return this }, end() {} }
  return handler({ method, query: q, headers: {}, body }, res)
}
await mock({})                                              // info
await mock({ action: "quote", market: "BTC-USDC", threshold: "2", payout: "0.05" })  // quote
await mock({ action: "buy" }, "POST", { buyer: "0x46213abeca58cc9a89a269fd25a8737c700ca164", market: "BTC-USDC", thresholdPct: 2, payoutUsdc: 0.05, horizonSec: 3600 }) // demo buy
await mock({ action: "resolve" })                           // dry-run
