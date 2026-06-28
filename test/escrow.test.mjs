import { test } from "node:test"
import assert from "node:assert/strict"

// Pure model mirroring contracts/CronusJobEscrow.sol
const ZERO = "0x0000000000000000000000000000000000000000"
const S = { None: 0, Funded: 1, Submitted: 2, Completed: 3, Refunded: 4, Rejected: 5 }

function createEscrow(registry = null) { return { jobCount: 0, jobs: new Map(), bal: new Map(), registry } }
const bal = (e, w) => e.bal.get(w) || 0n
const setBal = (e, w, v) => e.bal.set(w, v)

function createJob(e, client, provider, evaluator, amount, deadline, now, specURI = "spec") {
  if (provider === ZERO || amount <= 0n || deadline <= now) throw new Error("BadParams")
  if (e.registry && !e.registry.has(provider)) throw new Error("ProviderNotRegistered")
  if (bal(e, client) < amount) throw new Error("BadParams")
  const jobId = ++e.jobCount
  e.jobs.set(jobId, { client, provider, evaluator, amount, deadline, status: S.Funded, resultURI: "" })
  setBal(e, client, bal(e, client) - amount)
  return jobId
}
const isArbiter = (j, who) => who === j.client || (j.evaluator !== ZERO && who === j.evaluator)
function submit(e, caller, jobId, resultURI) {
  const j = e.jobs.get(jobId)
  if (!j) throw new Error("NotFound")
  if (caller !== j.provider) throw new Error("NotProvider")
  if (j.status !== S.Funded) throw new Error("BadStatus")
  j.resultURI = resultURI; j.status = S.Submitted
}
function release(e, caller, jobId) {
  const j = e.jobs.get(jobId)
  if (!j) throw new Error("NotFound")
  if (!isArbiter(j, caller)) throw new Error("NotArbiter")
  if (j.status !== S.Submitted) throw new Error("BadStatus")
  j.status = S.Completed; setBal(e, j.provider, bal(e, j.provider) + j.amount)
}
function reject(e, caller, jobId) {
  const j = e.jobs.get(jobId)
  if (!j) throw new Error("NotFound")
  if (!isArbiter(j, caller)) throw new Error("NotArbiter")
  if (j.status !== S.Submitted) throw new Error("BadStatus")
  j.status = S.Rejected; setBal(e, j.client, bal(e, j.client) + j.amount)
}
function refundExpired(e, caller, jobId, now) {
  const j = e.jobs.get(jobId)
  if (!j) throw new Error("NotFound")
  if (caller !== j.client) throw new Error("NotClient")
  if (j.status !== S.Funded && j.status !== S.Submitted) throw new Error("BadStatus")
  if (now < j.deadline) throw new Error("NotExpired")
  j.status = S.Refunded; setBal(e, j.client, bal(e, j.client) + j.amount)
}

const CLIENT = "0x00000000000000000000000000000000000c1en7"
const PROV = "0x0000000000000000000000000000000000000pr0v".replace("pr0v","9909")
const EVAL = "0x000000000000000000000000000000000000eva1".replace("eva1"," e5a1").replace(" ","")
const T = 1000

test("happy path: create escrows funds, submit, release pays provider", () => {
  const e = createEscrow(); setBal(e, CLIENT, 1000n)
  const id = createJob(e, CLIENT, PROV, ZERO, 100n, T + 100, T)
  assert.equal(bal(e, CLIENT), 900n)
  submit(e, PROV, id, "ipfs://result")
  release(e, CLIENT, id)
  assert.equal(bal(e, PROV), 100n)
  assert.equal(e.jobs.get(id).status, S.Completed)
})
test("createJob reverts when deadline is not in the future", () => {
  const e = createEscrow(); setBal(e, CLIENT, 1000n)
  assert.throws(() => createJob(e, CLIENT, PROV, ZERO, 100n, T, T), /BadParams/)
})
test("createJob reverts when provider is not ERC-8004 registered (gate on)", () => {
  const e = createEscrow(new Set([EVAL])); setBal(e, CLIENT, 1000n)
  assert.throws(() => createJob(e, CLIENT, PROV, ZERO, 100n, T + 100, T), /ProviderNotRegistered/)
})
test("createJob succeeds when identity gate is disabled", () => {
  const e = createEscrow(null); setBal(e, CLIENT, 1000n)
  assert.equal(createJob(e, CLIENT, PROV, ZERO, 100n, T + 100, T), 1)
})
test("submit only by provider", () => {
  const e = createEscrow(); setBal(e, CLIENT, 1000n)
  const id = createJob(e, CLIENT, PROV, ZERO, 100n, T + 100, T)
  assert.throws(() => submit(e, CLIENT, id, "x"), /NotProvider/)
})
test("submit requires Funded status", () => {
  const e = createEscrow(); setBal(e, CLIENT, 1000n)
  const id = createJob(e, CLIENT, PROV, ZERO, 100n, T + 100, T)
  submit(e, PROV, id, "x")
  assert.throws(() => submit(e, PROV, id, "y"), /BadStatus/)
})
test("release requires arbiter (client or evaluator)", () => {
  const e = createEscrow(); setBal(e, CLIENT, 1000n)
  const id = createJob(e, CLIENT, PROV, ZERO, 100n, T + 100, T)
  submit(e, PROV, id, "x")
  assert.throws(() => release(e, PROV, id), /NotArbiter/)
})
test("release requires Submitted status (cannot release before submit)", () => {
  const e = createEscrow(); setBal(e, CLIENT, 1000n)
  const id = createJob(e, CLIENT, PROV, ZERO, 100n, T + 100, T)
  assert.throws(() => release(e, CLIENT, id), /BadStatus/)
})
test("evaluator can release (hybrid model)", () => {
  const e = createEscrow(); setBal(e, CLIENT, 1000n)
  const id = createJob(e, CLIENT, PROV, EVAL, 100n, T + 100, T)
  submit(e, PROV, id, "x")
  release(e, EVAL, id)
  assert.equal(bal(e, PROV), 100n)
})
test("reject refunds the client and sets Rejected", () => {
  const e = createEscrow(); setBal(e, CLIENT, 1000n)
  const id = createJob(e, CLIENT, PROV, EVAL, 100n, T + 100, T)
  submit(e, PROV, id, "x")
  reject(e, EVAL, id)
  assert.equal(bal(e, CLIENT), 1000n)
  assert.equal(e.jobs.get(id).status, S.Rejected)
})
test("refundExpired reverts before deadline, refunds after", () => {
  const e = createEscrow(); setBal(e, CLIENT, 1000n)
  const id = createJob(e, CLIENT, PROV, ZERO, 100n, T + 100, T)
  assert.throws(() => refundExpired(e, CLIENT, id, T + 50), /NotExpired/)
  refundExpired(e, CLIENT, id, T + 200)
  assert.equal(bal(e, CLIENT), 1000n)
  assert.equal(e.jobs.get(id).status, S.Refunded)
})
test("refundExpired only by client", () => {
  const e = createEscrow(); setBal(e, CLIENT, 1000n)
  const id = createJob(e, CLIENT, PROV, ZERO, 100n, T + 100, T)
  assert.throws(() => refundExpired(e, PROV, id, T + 200), /NotClient/)
})
test("cannot release twice (BadStatus after Completed)", () => {
  const e = createEscrow(); setBal(e, CLIENT, 1000n)
  const id = createJob(e, CLIENT, PROV, ZERO, 100n, T + 100, T)
  submit(e, PROV, id, "x")
  release(e, CLIENT, id)
  assert.throws(() => release(e, CLIENT, id), /BadStatus/)
})
test("funds are conserved across the completed lifecycle", () => {
  const e = createEscrow(); setBal(e, CLIENT, 1000n)
  const id = createJob(e, CLIENT, PROV, ZERO, 100n, T + 100, T)
  submit(e, PROV, id, "x")
  release(e, CLIENT, id)
  assert.equal(bal(e, CLIENT) + bal(e, PROV), 1000n)
})
