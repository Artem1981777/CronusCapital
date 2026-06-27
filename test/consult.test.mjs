import test from "node:test";
import assert from "node:assert";
import { fetchWithRetry } from "../api/consult.js";

test("retries on 5xx then succeeds", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls++;
    if (calls < 3) return { ok: false, status: 503 };
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const res = await fetchWithRetry("http://x", undefined, { retries: 3, baseMs: 1 });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(calls, 3);
});

test("does NOT retry on 4xx", async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: false, status: 404 }; };
  const res = await fetchWithRetry("http://x", undefined, { retries: 3, baseMs: 1 });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(calls, 1);
});
