import test from "node:test"
import assert from "node:assert/strict"
import {
  dataMarketEnabled, liveSettlementEnabled, parseSources, decideDataPurchase,
  recordUpstreamPayment, cogsAtomic, netPnlAfterCogs,
} from "../lib/dataMarket.js"

const A = (c) => "0x" + String(c).repeat(40)
const SRC = [
  { id: "cheap", label: "cheap feed", url: "", priceUsdAtomic: 100, recipient: A("1") },
  { id: "dear", label: "dear feed", url: "", priceUsdAtomic: 900, recipient: A("2") },
]

test("dataMarketEnabled default off", () => {
  assert.equal(dataMarketEnabled({}), false)
  assert.equal(dataMarketEnabled({ PAY_TO_THINK: "1" }), true)
  assert.equal(dataMarketEnabled({ PAY_TO_THINK: "0" }), false)
})
test("liveSettlementEnabled default off", () => {
  assert.equal(liveSettlementEnabled({}), false)
  assert.equal(liveSettlementEnabled({ PAY_TO_THINK_LIVE: "1" }), true)
})
test("parseSources parses valid, drops invalid", () => {
  const raw = JSON.stringify([
    { id: "cb", label: "Coinbase", url: "https://x/y", priceUsdAtomic: 500, recipient: A("a") },
    { id: "bad-recipient", priceUsdAtomic: 100, recipient: "0xzz" },
    { id: "bad-price", priceUsdAtomic: -5, recipient: A("b") },
    { priceUsdAtomic: 100, recipient: A("c") },
  ])
  const s = parseSources(raw)
  assert.equal(s.length, 1)
  assert.equal(s[0].id, "cb")
  assert.equal(s[0].priceUsdAtomic, 500)
})
test("parseSources handles garbage", () => {
  assert.deepEqual(parseSources("not json"), [])
  assert.deepEqual(parseSources(null), [])
  assert.deepEqual(parseSources(42), [])
})
test("decideDataPurchase disabled / no sources", () => {
  assert.equal(decideDataPurchase({ enabled: false, conviction: 60, sources: SRC }).buy, false)
  assert.equal(decideDataPurchase({ enabled: true, conviction: 60, sources: [] }).buy, false)
})
test("decideDataPurchase skips confident and low", () => {
  assert.equal(decideDataPurchase({ enabled: true, conviction: 80, sources: SRC, budgetAtomic: 10000 }).buy, false)
  assert.equal(decideDataPurchase({ enabled: true, conviction: 20, sources: SRC, budgetAtomic: 10000 }).buy, false)
})
test("decideDataPurchase buys cheapest on borderline", () => {
  const d = decideDataPurchase({ enabled: true, conviction: 60, sources: SRC, budgetAtomic: 10000 })
  assert.equal(d.buy, true)
  assert.equal(d.source.id, "cheap")
})
test("decideDataPurchase respects budget", () => {
  assert.equal(decideDataPurchase({ enabled: true, conviction: 60, sources: SRC, budgetAtomic: 50 }).buy, false)
})
test("recordUpstreamPayment simulated by default", () => {
  const r = recordUpstreamPayment(SRC[0], {})
  assert.equal(r.mode, "simulated")
  assert.equal(r.txRef, null)
  assert.equal(r.recipient, SRC[0].recipient)
})
test("recordUpstreamPayment settled needs live + txRef", () => {
  assert.equal(recordUpstreamPayment(SRC[0], { live: true }).mode, "simulated")
  const r = recordUpstreamPayment(SRC[0], { live: true, txRef: "0xabc" })
  assert.equal(r.mode, "settled")
  assert.equal(r.txRef, "0xabc")
})
test("cogsAtomic sums and filters settled", () => {
  const pays = [recordUpstreamPayment(SRC[0], {}), recordUpstreamPayment(SRC[1], { live: true, txRef: "0x1" })]
  assert.equal(cogsAtomic(pays), 1000)
  assert.equal(cogsAtomic(pays, { settledOnly: true }), 900)
})
test("netPnlAfterCogs subtracts cogs", () => {
  const pays = [recordUpstreamPayment(SRC[0], {})]
  assert.equal(netPnlAfterCogs(2000, pays), 1900)
  assert.equal(netPnlAfterCogs(2000, pays, { settledOnly: true }), 2000)
})
