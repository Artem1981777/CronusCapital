import { test } from "node:test"
import assert from "node:assert/strict"
import { assetSymbol, acceptedAssets, normalizeRate, toUsdAtomic, coversUsdPrice, USDC_ADDRESS, EURC_ADDRESS } from "../lib/fx.js"

test("assetSymbol maps known tokens", () => {
  assert.equal(assetSymbol(USDC_ADDRESS), "USDC")
  assert.equal(assetSymbol(EURC_ADDRESS.toUpperCase()), "EURC")
  assert.equal(assetSymbol("0xdead"), "UNKNOWN")
})

test("acceptedAssets gates EURC behind flag", () => {
  assert.deepEqual(acceptedAssets({}).map((a) => a.symbol), ["USDC"])
  assert.deepEqual(acceptedAssets({ EURC_ENABLED: "1" }).map((a) => a.symbol), ["USDC", "EURC"])
})

test("normalizeRate enforces sane EUR/USD band", () => {
  assert.equal(normalizeRate(1.08), 1.08)
  assert.equal(normalizeRate(0), null)
  assert.equal(normalizeRate(5), null)
  assert.equal(normalizeRate("abc"), null)
})

test("toUsdAtomic: USDC 1:1, EURC via rate", () => {
  assert.equal(toUsdAtomic("20000", "USDC", null), 20000n)
  assert.equal(toUsdAtomic("20000", "EURC", 1.10), 22000n)
  assert.equal(toUsdAtomic("20000", "EURC", null), null)
  assert.equal(toUsdAtomic("20000", "PEPE", 1.1), null)
})

test("coversUsdPrice: EURC covers USD price after FX", () => {
  assert.equal(coversUsdPrice({ paidAtomic: "20000", paidSymbol: "EURC", priceUsdAtomic: "20000", eurUsdRate: 1.10 }).ok, true)
  assert.equal(coversUsdPrice({ paidAtomic: "18000", paidSymbol: "EURC", priceUsdAtomic: "20000", eurUsdRate: 1.05 }).ok, false)
  assert.equal(coversUsdPrice({ paidAtomic: "20000", paidSymbol: "USDC", priceUsdAtomic: "20000" }).ok, true)
})
