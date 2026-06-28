import { test } from "node:test"
import assert from "node:assert/strict"

// Pure model mirroring contracts/CronusIdentityRegistry.sol
const ZERO = "0x0000000000000000000000000000000000000000"
function createRegistry() { return { agentCount: 0, agents: new Map(), idByAddress: new Map() } }
function register(r, caller, agentAddress, agentDomain, metadataURI) {
  if (!agentAddress || agentAddress === ZERO) throw new Error("ZeroAddress")
  if (r.idByAddress.get(agentAddress)) throw new Error("AlreadyRegistered")
  const agentId = ++r.agentCount
  r.agents.set(agentId, { agentId, agentAddress, agentDomain, metadataURI, owner: caller, registeredAt: 1, updatedAt: 1 })
  r.idByAddress.set(agentAddress, agentId)
  return agentId
}
function updateAgent(r, caller, agentId, agentAddress, agentDomain, metadataURI) {
  const a = r.agents.get(agentId)
  if (!a) throw new Error("NotRegistered")
  if (a.owner !== caller) throw new Error("NotOwner")
  if (!agentAddress || agentAddress === ZERO) throw new Error("ZeroAddress")
  if (agentAddress !== a.agentAddress) {
    if (r.idByAddress.get(agentAddress)) throw new Error("AlreadyRegistered")
    r.idByAddress.set(a.agentAddress, 0)
    r.idByAddress.set(agentAddress, agentId)
    a.agentAddress = agentAddress
  }
  a.agentDomain = agentDomain
  a.metadataURI = metadataURI
}
function transferAgent(r, caller, agentId, newOwner) {
  const a = r.agents.get(agentId)
  if (!a) throw new Error("NotRegistered")
  if (a.owner !== caller) throw new Error("NotOwner")
  if (!newOwner || newOwner === ZERO) throw new Error("ZeroAddress")
  a.owner = newOwner
}
function resolveByAddress(r, agentAddress) {
  const id = r.idByAddress.get(agentAddress)
  if (!id) throw new Error("NotRegistered")
  return r.agents.get(id)
}
function isRegistered(r, agentAddress) { return !!r.idByAddress.get(agentAddress) }

const A1 = "0x0000000000000000000000000000000000000a01"
const A2 = "0x0000000000000000000000000000000000000a02"
const O1 = "0x0000000000000000000000000000000000000b01"
const O2 = "0x0000000000000000000000000000000000000b02"

test("register assigns incrementing ids starting at 1", () => {
  const r = createRegistry()
  assert.equal(register(r, O1, A1, "cronus.app", "ipfs://card1"), 1)
  assert.equal(register(r, O1, A2, "scout.cronus.app", "ipfs://card2"), 2)
  assert.equal(r.agentCount, 2)
})
test("registering the same agentAddress twice reverts", () => {
  const r = createRegistry()
  register(r, O1, A1, "d", "u")
  assert.throws(() => register(r, O1, A1, "d", "u"), /AlreadyRegistered/)
})
test("zero address cannot be registered", () => {
  const r = createRegistry()
  assert.throws(() => register(r, O1, ZERO, "d", "u"), /ZeroAddress/)
})
test("resolveByAddress returns the record; unknown reverts", () => {
  const r = createRegistry()
  register(r, O1, A1, "cronus.app", "ipfs://card1")
  assert.equal(resolveByAddress(r, A1).metadataURI, "ipfs://card1")
  assert.throws(() => resolveByAddress(r, A2), /NotRegistered/)
})
test("updateAgent by a non-owner reverts", () => {
  const r = createRegistry()
  register(r, O1, A1, "d", "u")
  assert.throws(() => updateAgent(r, O2, 1, A1, "d2", "u2"), /NotOwner/)
})
test("owner can update domain and metadataURI", () => {
  const r = createRegistry()
  register(r, O1, A1, "d", "u")
  updateAgent(r, O1, 1, A1, "d2", "ipfs://new")
  assert.equal(resolveByAddress(r, A1).metadataURI, "ipfs://new")
  assert.equal(resolveByAddress(r, A1).agentDomain, "d2")
})
test("updating the operational address re-points the index and frees the old one", () => {
  const r = createRegistry()
  register(r, O1, A1, "d", "u")
  updateAgent(r, O1, 1, A2, "d", "u")
  assert.equal(resolveByAddress(r, A2).agentId, 1)
  assert.equal(isRegistered(r, A1), false)
})
test("cannot update to an already-registered address", () => {
  const r = createRegistry()
  register(r, O1, A1, "d", "u")
  register(r, O1, A2, "d", "u")
  assert.throws(() => updateAgent(r, O1, 1, A2, "d", "u"), /AlreadyRegistered/)
})
test("transfer moves ownership; old owner loses write access, new owner gains it", () => {
  const r = createRegistry()
  register(r, O1, A1, "d", "u")
  transferAgent(r, O1, 1, O2)
  assert.throws(() => updateAgent(r, O1, 1, A1, "x", "x"), /NotOwner/)
  updateAgent(r, O2, 1, A1, "d2", "u2")
  assert.equal(resolveByAddress(r, A1).agentDomain, "d2")
})
test("isRegistered reflects registration state", () => {
  const r = createRegistry()
  assert.equal(isRegistered(r, A1), false)
  register(r, O1, A1, "d", "u")
  assert.equal(isRegistered(r, A1), true)
})
