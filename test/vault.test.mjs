import { test } from "node:test"
import assert from "node:assert/strict"

// Pure model of CronusVault share accounting (mirrors the on-chain contract)
function createVault() {
  return { totalShares: 0n, totalAssets: 0n, shares: new Map() }
}
function convertToShares(v, assets) {
  return v.totalShares === 0n || v.totalAssets === 0n ? assets : (assets * v.totalShares) / v.totalAssets
}
function convertToAssets(v, sh) {
  return v.totalShares === 0n ? 0n : (sh * v.totalAssets) / v.totalShares
}
function deposit(v, who, assets) {
  const minted = convertToShares(v, assets)
  v.shares.set(who, (v.shares.get(who) || 0n) + minted)
  v.totalShares += minted
  v.totalAssets += assets
  return minted
}
function addYield(v, amount) { v.totalAssets += amount }
function withdrawAll(v, who) {
  const sh = v.shares.get(who) || 0n
  const out = convertToAssets(v, sh)
  v.totalShares -= sh
  v.totalAssets -= out
  v.shares.set(who, 0n)
  return out
}

test("deposit mints shares 1:1 for the first depositor", () => {
  const v = createVault()
  const minted = deposit(v, "a", 100n)
  assert.equal(minted, 100n)
  assert.equal(convertToAssets(v, minted), 100n)
})

test("addYield raises assets-per-share for existing holders", () => {
  const v = createVault()
  deposit(v, "a", 100n)
  addYield(v, 50n)
  assert.equal(convertToAssets(v, v.shares.get("a")), 150n)
})

test("withdrawAll returns deposit plus accrued yield", () => {
  const v = createVault()
  deposit(v, "a", 100n)
  addYield(v, 25n)
  assert.equal(withdrawAll(v, "a"), 125n)
  assert.equal(v.totalShares, 0n)
})

test("a later depositor does not steal earlier holder value", () => {
  const v = createVault()
  deposit(v, "a", 100n)
  addYield(v, 100n)
  const mintedB = deposit(v, "b", 200n)
  assert.equal(convertToAssets(v, v.shares.get("a")), 200n)
  assert.equal(convertToAssets(v, mintedB), 200n)
})

test("yield splits pro-rata between holders", () => {
  const v = createVault()
  deposit(v, "a", 100n)
  deposit(v, "b", 300n)
  addYield(v, 80n)
  assert.equal(convertToAssets(v, v.shares.get("a")), 120n)
  assert.equal(convertToAssets(v, v.shares.get("b")), 360n)
})
