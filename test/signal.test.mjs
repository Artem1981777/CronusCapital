import { test } from "node:test"
import assert from "node:assert/strict"
import { keccak256, toBytes } from "viem"

// Pure models mirroring api/signal.js x402 verification + replay protection.
const PRICE = 20000n            // 0.02 USDC (6 decimals)
const MAX_AGE_SEC = 1800        // replay window
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const PAY_TO = "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd"
const USDC = "0x3600000000000000000000000000000000000000"

// mirrors extractTxHash()
function extractTxHash(header) {
  const h = String(header || "").trim()
  if (/^0x[0-9a-fA-F]{64}$/.test(h)) return h
  try { const p = JSON.parse(Buffer.from(h, "base64").toString("utf8")); if (p && p.txHash) return String(p.txHash) } catch {}
  try { const p = JSON.parse(h); if (p && p.txHash) return String(p.txHash) } catch {}
  return null
}

// mirrors the Transfer-log summation inside verifyPayment()
function sumPaidToPayTo(logs) {
  let paid = 0n
  for (const l of logs || []) {
    if (l.address && l.address.toLowerCase() === USDC && l.topics && l.topics[0] && l.topics[0].toLowerCase() === TRANSFER_TOPIC && l.topics[2]) {
      const to = "0x" + l.topics[2].slice(26).toLowerCase()
      if (to === PAY_TO) paid += BigInt(l.data)
    }
  }
  return paid
}

// mirrors the replay-window age check ("payment older than MAX_AGE_SEC")
function withinReplayWindow(blockTs, nowSec, maxAge = MAX_AGE_SEC) {
  return (nowSec - blockTs) <= maxAge
}

// mirrors markUsedOnce() NX one-time-use semantics
function makeUsedStore() {
  const used = new Set()
  return (txHash) => { if (used.has(txHash)) return false; used.add(txHash); return true }
}

// mirrors the on-chain commitment hash
function commitment(txHash, topic, verdict, conviction, settledAt) {
  return keccak256(toBytes("CRONUS-SIGNAL|" + txHash + "|" + topic + "|" + verdict + "|" + conviction + "|" + settledAt))
}

const HASH = "0x" + "a".repeat(64)
function transferLog(toAddr, amount) {
  return {
    address: USDC,
    topics: [TRANSFER_TOPIC, "0x".padEnd(66, "0"), "0x000000000000000000000000" + toAddr.slice(2)],
    data: "0x" + amount.toString(16),
  }
}

test("extractTxHash accepts a raw 0x + 64 hex hash", () => {
  assert.equal(extractTxHash(HASH), HASH)
})
test("extractTxHash accepts base64 JSON { txHash }", () => {
  const b64 = Buffer.from(JSON.stringify({ txHash: HASH })).toString("base64")
  assert.equal(extractTxHash(b64), HASH)
})
test("extractTxHash accepts plain JSON { txHash }", () => {
  assert.equal(extractTxHash(JSON.stringify({ txHash: HASH })), HASH)
})
test("extractTxHash rejects garbage and wrong-length hashes", () => {
  assert.equal(extractTxHash("not-a-hash"), null)
  assert.equal(extractTxHash("0x1234"), null)
  assert.equal(extractTxHash(""), null)
  assert.equal(extractTxHash(undefined), null)
})
test("payment of exactly PRICE to payTo is sufficient", () => {
  assert.ok(sumPaidToPayTo([transferLog(PAY_TO, PRICE)]) >= PRICE)
})
test("underpayment is rejected", () => {
  assert.ok(sumPaidToPayTo([transferLog(PAY_TO, PRICE - 1n)]) < PRICE)
})
test("transfers to a different recipient are ignored", () => {
  const other = "0x000000000000000000000000000000000000dead"
  assert.equal(sumPaidToPayTo([transferLog(other, PRICE * 5n)]), 0n)
})
test("multiple transfers to payTo are summed", () => {
  assert.equal(sumPaidToPayTo([transferLog(PAY_TO, 12000n), transferLog(PAY_TO, 8000n)]), PRICE)
})
test("fresh payment is inside the replay window", () => {
  const now = 1_000_000
  assert.ok(withinReplayWindow(now - 60, now))
})
test("stale payment past MAX_AGE_SEC is a closed replay window", () => {
  const now = 1_000_000
  assert.equal(withinReplayWindow(now - (MAX_AGE_SEC + 1), now), false)
})
test("one-time-use: same txHash cannot be consumed twice (replay blocked)", () => {
  const consume = makeUsedStore()
  assert.equal(consume(HASH), true)
  assert.equal(consume(HASH), false)
})
test("commitment is deterministic for identical inputs", () => {
  assert.equal(commitment(HASH, "BTC-USDC", "YES", 72, 1700), commitment(HASH, "BTC-USDC", "YES", 72, 1700))
})
test("commitment changes when any input changes", () => {
  const base = commitment(HASH, "BTC-USDC", "YES", 72, 1700)
  assert.notEqual(base, commitment("0x" + "b".repeat(64), "BTC-USDC", "YES", 72, 1700))
  assert.notEqual(base, commitment(HASH, "ETH-USDC", "YES", 72, 1700))
  assert.notEqual(base, commitment(HASH, "BTC-USDC", "NO", 72, 1700))
})
