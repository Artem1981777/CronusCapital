import test from "node:test"
import assert from "node:assert/strict"
import handler from "../lib/payToThink.js"

function mockRes() {
  return { _status: 0, _json: null, _headers: {}, setHeader(k, v) { this._headers[k] = v }, status(c) { this._status = c; return this }, json(o) { this._json = o; return this }, end() { return this } }
}

test("payToThink exports a handler", () => {
  assert.equal(typeof handler, "function")
})
test("GET returns public config (no auth, no funds)", async () => {
  const res = mockRes()
  await handler({ method: "GET", query: {}, headers: {} }, res)
  assert.equal(res._status, 200)
  assert.equal(res._json.ok, true)
  assert.equal(res._json.mode, "config")
  assert.ok(Object.prototype.hasOwnProperty.call(res._json, "settled_cogs_atomic"))
})
test("POST execute without auth is 401", async () => {
  const res = mockRes()
  await handler({ method: "POST", query: { action: "execute" }, headers: {}, body: { conviction: 60 } }, res)
  assert.equal(res._status, 401)
  assert.equal(res._json.ok, false)
})
test("POST preview needs no auth and moves no funds", async () => {
  const res = mockRes()
  await handler({ method: "POST", query: { action: "preview" }, headers: {}, body: { conviction: 60, force: true } }, res)
  assert.equal(res._status, 200)
  assert.equal(res._json.action, "preview")
})
