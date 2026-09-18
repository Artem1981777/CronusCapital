import { test } from "node:test"
import assert from "node:assert/strict"
import { CCTP_DOMAINS, evmAddressToBytes32, resolveDomain, buildBurnArgs, isHexAddress, supportedChains } from "../lib/withdraw.js"

test("canonical CCTP mainnet domains", () => {
  assert.equal(CCTP_DOMAINS.arc, 26)
  assert.equal(CCTP_DOMAINS.base, 6)
  assert.deepEqual(supportedChains(), ["arc", "base"])
})

test("evmAddressToBytes32 pads + lowercases", () => {
  const r = evmAddressToBytes32("0xDC6778c5F8Cc74B10AeD11C48306D4CFc5737FBD")
  assert.equal(r, "0x000000000000000000000000dc6778c5f8cc74b10aed11c48306d4cfc5737fbd")
  assert.equal(r.length, 66)
})

test("evmAddressToBytes32 rejects bad input", () => {
  assert.throws(() => evmAddressToBytes32("not-an-address"))
  assert.throws(() => evmAddressToBytes32("0x1234"))
  assert.equal(isHexAddress("0x000000000000000000000000000000000000dEaD"), true)
})

test("resolveDomain by mainnet name and number", () => {
  assert.equal(resolveDomain("base"), 6)
  assert.equal(resolveDomain("arc"), 26)
  assert.equal(resolveDomain(6), 6)
  assert.equal(resolveDomain(26), 26)
  assert.throws(() => resolveDomain("mainnetFoo"))
  assert.throws(() => resolveDomain(999))
})

test("buildBurnArgs happy path with default maxFee", () => {
  const b = buildBurnArgs({ amountAtomic: "1000000", destChain: "base", recipient: "0x000000000000000000000000000000000000dEaD" })
  assert.equal(b.functionName, "depositForBurn")
  assert.equal(b.domain, 6)
  assert.equal(b.args[1], 6)
  assert.equal(b.args[0], 1000000n)
  assert.equal(b.maxFee, 10000n)
  assert.equal(b.args[6], 1000)
  assert.equal(b.destinationCaller, "0x" + "0".repeat(64))
})

test("buildBurnArgs validates amounts and recipient", () => {
  assert.throws(() => buildBurnArgs({ amountAtomic: "0", destChain: "base", recipient: "0x000000000000000000000000000000000000dEaD" }))
  assert.throws(() => buildBurnArgs({ amountAtomic: "100", destChain: "base", recipient: "bad" }))
  assert.throws(() => buildBurnArgs({ amountAtomic: "100", destChain: "base", recipient: "0x000000000000000000000000000000000000dEaD", maxFeeAtomic: "100" }))
  assert.equal(supportedChains().includes("base"), true)
})
