// lib/drills.js — fire drills + bounded-loss certificate (ADDITIVE, read-only, no keys).
// Configuration proves the guard is wired correctly. It does not prove the guard still
// fires. This surface answers the second question: when was containment last exercised
// against the live contract, what did it reject, and what is the arithmetic worst case
// if the agent key is fully compromised right now. A drill that was never run reads as
// unknown, never as safe.
import { Interface } from "ethers"

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const GUARD = (process.env.AGENT_GUARD_V2 || "0xeA4788164c63B0EF2788d9c74859B43f42BC391E").toLowerCase()
const EXPLORER_TX = "https://testnet.arcscan.app/tx/"
const EXPLORER_ADDR = "https://testnet.arcscan.app/address/"
const LOG_KEY = "cronus:drills:v1"
const KEEP = Number(process.env.DRILL_KEEP || "20")
const STALE_AFTER = Number(process.env.DRILL_STALE_AFTER || "86400")

const SCENARIOS = [
  { id: "drain_to_new_address", expect: "revert", why: "a fully compromised key must not reach an address nobody approved" },
  { id: "over_per_tx_cap", expect: "revert", why: "a single payment must not exceed the per-tx cap" },
  { id: "operator_escalation", expect: "revert", why: "the spending key must not be able to change the rules or unpause" },
  { id: "bounded_allowlisted_payment", expect: "success", why: "a bounded rail must still pay, otherwise the test proves nothing but a dead contract" },
]

const GUARD_ABI = [
  "function operator() view returns (address)",
  "function guardian() view returns (address)",
  "function perTxCap() view returns (uint256)",
  "function dailyCap() view returns (uint256)",
  "function MAX_PER_TX_CAP() view returns (uint256)",
  "function MAX_DAILY_CAP() view returns (uint256)",
  "function spentInWindow() view returns (uint256)",
  "function windowStart() view returns (uint256)",
  "function paused() view returns (bool)",
  "function available() view returns (uint256)",
]
const GI = new Interface(GUARD_ABI)

async function kvCmd(cmd) {
  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return null
  try {
    const r = await fetch(base, { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(cmd) })
    const j = await r.json()
    return j && j.result
  } catch (_) { return null }
}

async function rpcOnce(method, params) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })
  const j = await r.json()
  if (j.error) throw new Error(method + ": " + JSON.stringify(j.error))
  return j.result
}

async function rpc(method, params) {
  let last
  for (let i = 0; i < 3; i++) {
    try { return await rpcOnce(method, params) }
    catch (e) {
      last = e
      const m = String((e && e.message) || e)
      if (!/32005|32011|request limit|rate limit|timeout|fetch failed|ECONN|502|503|504/i.test(m)) throw e
      await new Promise((z) => setTimeout(z, 350 + i * 550))
    }
  }
  throw last
}

function makeReader() {
  const unread = []
  const call = async (fn, label) => {
    try {
      const raw = await rpc("eth_call", [{ to: GUARD, data: GI.encodeFunctionData(fn, []) }, "latest"])
      const dec = GI.decodeFunctionResult(fn, raw)
      return dec.length === 1 ? dec[0] : dec
    } catch (e) {
      unread.push({ field: label || fn, reason: String((e && e.message) || e) })
      return null
    }
  }
  return { call, unread }
}

const usdc = (v) => (v === null || v === undefined ? null : Number(v) / 1e6)
const num = (v) => (v === null || v === undefined ? null : Number(v))
const addr = (v) => (v === null || v === undefined ? null : String(v).toLowerCase())

async function readRuns() {
  const rows = await kvCmd(["LRANGE", LOG_KEY, "0", String(KEEP - 1)])
  if (!Array.isArray(rows)) return { runs: [], storage: rows === null ? "unavailable" : "empty" }
  const runs = []
  for (const row of rows) {
    try { runs.push(typeof row === "string" ? JSON.parse(row) : row) } catch (_) {}
  }
  return { runs, storage: "ok" }
}

export async function resolveDrills() {
  const r = makeReader()
  const fields = ["operator", "guardian", "perTxCap", "dailyCap", "MAX_PER_TX_CAP", "MAX_DAILY_CAP", "spentInWindow", "windowStart", "paused", "available"]
  const got = []
  for (const f of fields) got.push(await r.call(f, "guard." + f))
  const G = {}
  fields.forEach((f, i) => { G[f] = got[i] })

  const paused = G.paused === null || G.paused === undefined ? null : !!G.paused
  const perTx = usdc(G.perTxCap)
  const daily = usdc(G.dailyCap)
  const hardDaily = usdc(G.MAX_DAILY_CAP)
  const available = usdc(G.available)
  const spent = usdc(G.spentInWindow)
  const windowStart = num(G.windowStart)
  const nowSec = Math.floor(Date.now() / 1000)
  const windowResetsIn = windowStart === null ? null : Math.max(0, windowStart + 86400 - nowSec)

  // The worst case is arithmetic, not an adjective. Every input is read live; if any of
  // them is unread the answer is null, because an unknown ceiling is not a low one.
  const unknownLoss = [paused, perTx, daily, available].some((x) => x === null)
  const boundedLoss = {
    immediateUsdc: unknownLoss ? null : paused ? 0 : available,
    perRolling24hUsdc: daily === null ? null : paused ? 0 : daily,
    absoluteCeilingPerDayUsdc: hardDaily,
    perTransactionUsdc: perTx === null ? null : paused ? 0 : perTx,
    windowResetsInSeconds: windowResetsIn,
    recipientConstraint: "allowlisted addresses only; the contract exposes no enumeration of the allowlist, so its size is deliberately reported as unknown rather than guessed",
    assumption: "the operator key is fully compromised and the attacker is not slowed down by anything off-chain",
    excluded: "this figure is the contract's own ceiling. It does not model a compromise of two cold co-signers, which would still face the 48h timelock before any rule could change.",
    formula: "min(available, dailyCap - spentInWindow) now, dailyCap per rolling 24h window, both zero while paused, and never above the immutable MAX_DAILY_CAP fixed at deploy",
    spentInWindowUsdc: spent,
  }

  const { runs, storage } = await readRuns()
  const last = runs.length > 0 ? runs[0] : null
  const lastAt = last && last.finishedAt ? Date.parse(last.finishedAt) : null
  const ageSeconds = lastAt === null || Number.isNaN(lastAt) ? null : Math.round((Date.now() - lastAt) / 1000)
  const fresh = ageSeconds === null ? null : ageSeconds <= STALE_AFTER
  const status = last === null ? "never_run" : fresh ? "fresh" : "stale"

  const lastScenarios = last && Array.isArray(last.scenarios) ? last.scenarios : []
  const rogue = lastScenarios.filter((s) => s.expect === "revert")
  const control = lastScenarios.find((s) => s.expect === "success") || null
  const allRogueBlocked = rogue.length === 0 ? null : rogue.every((s) => s.outcome === "reverted")
  const controlPaid = control === null ? null : control.outcome === "succeeded"

  const inv = (name, holds, detail) => ({ name, holds, detail })
  const invariants = [
    inv("containment has been exercised against the live contract, not only configured", last === null ? null : true, last === null ? "no drill has ever been recorded; this reads unknown, not safe" : "last drill " + last.finishedAt),
    inv("the last exercise is recent enough to describe the contract as it is today", fresh, ageSeconds === null ? "no drill recorded" : Math.round(ageSeconds / 3600) + "h old, stale after " + Math.round(STALE_AFTER / 3600) + "h"),
    inv("every rogue scenario in the last drill was rejected on-chain", allRogueBlocked, rogue.length === 0 ? "no rogue scenario recorded" : rogue.filter((s) => s.outcome === "reverted").length + " of " + rogue.length + " reverted"),
    inv("the bounded rail still pays, so a passing drill is not just a dead contract", controlPaid, control === null ? "no control payment recorded" : control.outcome),
    inv("the worst case is published as a number derived from live caps", boundedLoss.perRolling24hUsdc !== null, boundedLoss.perRolling24hUsdc === null ? "caps unread" : boundedLoss.perRolling24hUsdc + " USDC per rolling 24h, ceiling " + hardDaily),
  ]

  return {
    ok: true,
    resolver: "cronus-drills",
    generatedAt: new Date().toISOString(),
    network: { name: "arc-testnet", chainId: 5042002, rpc: RPC },
    guard: { address: GUARD, explorer: EXPLORER_ADDR + GUARD, operator: addr(G.operator), guardian: addr(G.guardian), paused, perTxCapUsdc: perTx, dailyCapUsdc: daily, availableUsdc: available },
    boundedLoss,
    drills: {
      status,
      staleAfterSeconds: STALE_AFTER,
      lastRunAt: last === null ? null : last.finishedAt,
      ageSeconds,
      fresh,
      runCount: runs.length,
      kept: KEEP,
      storage,
      scenariosExpected: SCENARIOS,
      runs: runs.map((x) => ({ ...x, scenarios: (x.scenarios || []).map((s) => ({ ...s, explorer: s.txHash ? EXPLORER_TX + s.txHash : null })) })),
      note: "Each rogue scenario is a real transaction signed by the live agent key against the live guard. A rejected attempt is a FAILED transaction on the explorer, which is the cheapest unforgeable evidence available: a screenshot can be drawn, a reverted transaction in a mined block cannot.",
    },
    invariants,
    unread: r.unread,
    complete: r.unread.length === 0,
    honesty: "Caps and pause state are read live from Arc with eth_call and no keys. Drill history is replayed from stored runs and every scenario links to its transaction, so a reader can verify the outcome independently rather than trust this page. No drill on record reads as unknown, never as safe, and a stale drill is labelled stale rather than counted as a pass.",
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  try {
    const out = await resolveDrills()
    return res.status(200).json(out)
  } catch (e) {
    return res.status(503).json({ ok: false, error: "drill state could not be read from Arc", detail: String((e && e.message) || e) })
  }
}
