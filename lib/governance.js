// lib/governance.js — read-only governance state (ADDITIVE, no keys).
// Answers "who controls the controller" with values read off Arc, not from a README:
// the guard's owner, its immutable hard ceilings, its timelock, and the multisig that
// owns it. A value the node refuses to return is reported as unread, never defaulted:
// a missing "paused" must not render as "not paused".
import { Interface } from "ethers"

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const GUARD = (process.env.AGENT_GUARD_V2 || "0xeA4788164c63B0EF2788d9c74859B43f42BC391E").toLowerCase()
const MULTISIG = (process.env.CRONUS_MULTISIG || "0xde8874C53D82a38c1c2864ea575f9E62Dc29dA5F").toLowerCase()
const EXPLORER_ADDR = "https://testnet.arcscan.app/address/"
const CACHE_KEY = "cronus:governance:v1"
const TTL_SECONDS = Number(process.env.GOVERNANCE_CACHE_TTL || "120")
const STALE_MAX_SECONDS = Number(process.env.GOVERNANCE_STALE_MAX || "86400")
const PENDING_SCAN = Number(process.env.GOVERNANCE_PENDING_SCAN || "12")
const CONCURRENCY = 4

const GUARD_ABI = [
  "function token() view returns (address)",
  "function recovery() view returns (address)",
  "function owner() view returns (address)",
  "function operator() view returns (address)",
  "function guardian() view returns (address)",
  "function perTxCap() view returns (uint256)",
  "function dailyCap() view returns (uint256)",
  "function MAX_PER_TX_CAP() view returns (uint256)",
  "function MAX_DAILY_CAP() view returns (uint256)",
  "function timelockDelay() view returns (uint256)",
  "function spentInWindow() view returns (uint256)",
  "function windowStart() view returns (uint256)",
  "function paused() view returns (bool)",
  "function available() view returns (uint256)",
]
const MS_ABI = [
  "function threshold() view returns (uint256)",
  "function ownersCount() view returns (uint256)",
  "function txCount() view returns (uint256)",
  "function owners(uint256) view returns (address)",
  "function isOwner(address) view returns (bool)",
  "function txs(uint256) view returns (address to, uint256 value, bytes data, bool executed, uint256 confirmations)",
]
const GI = new Interface(GUARD_ABI)
const MI = new Interface(MS_ABI)

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

// The public node answers -32005 rate limit exceeded under load. That is "come back
// shortly", not a fact about governance, so it is retried before we call a value unread.
async function rpc(method, params) {
  let last
  for (let i = 0; i < 3; i++) {
    try { return await rpcOnce(method, params) }
    catch (e) {
      last = e
      const m = String((e && e.message) || e)
      if (!/32005|32011|request limit|rate limit|rate|timeout|fetch failed|ECONN|502|503|504/i.test(m)) throw e
      await new Promise((z) => setTimeout(z, 350 + i * 550))
    }
  }
  throw last
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}

function makeReader() {
  const unread = []
  const call = async (iface, to, fn, args, label) => {
    try {
      const data = iface.encodeFunctionData(fn, args || [])
      const raw = await rpc("eth_call", [{ to, data }, "latest"])
      const dec = iface.decodeFunctionResult(fn, raw)
      return dec.length === 1 ? dec[0] : dec
    } catch (e) {
      unread.push({ field: label || fn, reason: String((e && e.message) || e) })
      return null
    }
  }
  return { call, unread }
}

const usdc = (v) => (v === null || v === undefined ? null : Number(v) / 1e6)
const addr = (v) => (v === null || v === undefined ? null : String(v).toLowerCase())
const num = (v) => (v === null || v === undefined ? null : Number(v))

export async function resolveGovernance() {
  const r = makeReader()
  const fields = ["token", "recovery", "owner", "operator", "guardian", "perTxCap", "dailyCap", "MAX_PER_TX_CAP", "MAX_DAILY_CAP", "timelockDelay", "spentInWindow", "windowStart", "paused", "available"]
  const got = await mapPool(fields, CONCURRENCY, (f) => r.call(GI, GUARD, f, [], "guard." + f))
  const G = {}
  fields.forEach((f, i) => { G[f] = got[i] })

  const msHead = await mapPool(["threshold", "ownersCount", "txCount"], 3, (f) => r.call(MI, MULTISIG, f, [], "multisig." + f))
  const threshold = num(msHead[0])
  const ownersCount = num(msHead[1])
  const txCount = num(msHead[2])

  const ownerIdx = []
  for (let i = 0; i < Math.min(ownersCount === null ? 0 : ownersCount, 10); i++) ownerIdx.push(i)
  const owners = await mapPool(ownerIdx, CONCURRENCY, (i) => r.call(MI, MULTISIG, "owners", [i], "multisig.owners(" + i + ")"))

  const operatorAddr = addr(G.operator)
  const operatorIsSigner = operatorAddr ? await r.call(MI, MULTISIG, "isOwner", [operatorAddr], "multisig.isOwner(operator)") : null

  const ids = []
  if (txCount !== null) for (let i = txCount - 1; i >= 0 && ids.length < PENDING_SCAN; i--) ids.push(i)
  const txRows = await mapPool(ids, CONCURRENCY, async (i) => {
    const t = await r.call(MI, MULTISIG, "txs", [i], "multisig.txs(" + i + ")")
    if (!t) return null
    const data = String(t[2] || "0x")
    return { id: i, to: addr(t[0]), value: String(t[1]), executed: !!t[3], confirmations: num(t[4]), selector: data.slice(0, 10), dataBytes: Math.max(0, (data.length - 2) / 2), targetsGuard: addr(t[0]) === GUARD }
  })
  const txsSeen = txRows.filter(Boolean)
  const pending = txsSeen.filter((t) => !t.executed).map((t) => ({ ...t, confirmationsNeeded: threshold === null || t.confirmations === null ? null : Math.max(0, threshold - t.confirmations) }))

  const guardOwner = addr(G.owner)
  const perTx = usdc(G.perTxCap)
  const daily = usdc(G.dailyCap)
  const maxPerTx = usdc(G.MAX_PER_TX_CAP)
  const maxDaily = usdc(G.MAX_DAILY_CAP)
  const delay = num(G.timelockDelay)
  const recoveryAddr = addr(G.recovery)
  const guardianAddr = addr(G.guardian)
  const ownerList = owners.map(addr).filter(Boolean)

  // An invariant whose inputs could not be read is "unknown", never "holds". Reporting
  // an unverified control as satisfied is the failure mode this whole surface exists to
  // prevent, so holds is null when any input is missing.
  const inv = (name, holds, detail) => ({ name, holds, detail })
  const invariants = [
    inv("the guard is owned by the multisig, not by a single key", guardOwner === null ? null : guardOwner === MULTISIG, "owner=" + guardOwner),
    inv("moving the guard needs more than one key", threshold === null || ownersCount === null ? null : threshold >= 2 && threshold <= ownersCount, threshold + " of " + ownersCount),
    inv("live caps sit at or below the immutable hard ceilings", [perTx, daily, maxPerTx, maxDaily].some((x) => x === null) ? null : perTx <= maxPerTx && daily <= maxDaily, perTx + "/" + maxPerTx + " per tx, " + daily + "/" + maxDaily + " daily USDC"),
    inv("no owner action can take effect immediately", delay === null ? null : delay > 0, delay === null ? "unread" : delay + "s timelock"),
    inv("the cold recovery sink is neither the owner nor the operator", recoveryAddr === null || guardOwner === null || operatorAddr === null ? null : recoveryAddr !== guardOwner && recoveryAddr !== operatorAddr, "recovery=" + recoveryAddr),
    inv("the agent hot key cannot change the rules on its own", operatorIsSigner === null || threshold === null ? null : threshold >= 2, operatorIsSigner === true ? "operator holds 1 of " + threshold + " required signatures" : "operator holds no signature"),
    inv("the spend role and the pause role are held by different keys", operatorAddr === null || guardianAddr === null ? null : operatorAddr !== guardianAddr, operatorAddr === guardianAddr ? "one key is both operator and guardian" : "separate keys"),
  ]

  // A gap that is named is a gap a reviewer can price. Staying quiet here would repeat
  // the failure this file exists to prevent: presenting an unverified control as fine.
  const knownGaps = []
  if (operatorIsSigner === true) knownGaps.push({ gap: "the agent hot key is also one of the multisig signers", impact: "a compromised hot key needs one cold co-signer instead of two to queue a rules change; the 48h timelock still exposes the attempt before it can execute", severity: "medium", fix: "add a fresh cold owner, then remove the hot key from the multisig" })
  if (operatorAddr !== null && guardianAddr !== null && operatorAddr === guardianAddr) knownGaps.push({ gap: "one key holds both the spend role and the pause role", impact: "the documented three-role split is two roles on-chain, so the guardian is not an independent circuit breaker against the operator", severity: "medium", fix: "queue extSetGuardian to a separate cold watcher key" })
  return {
    ok: true,
    resolver: "cronus-governance",
    generatedAt: new Date().toISOString(),
    network: { name: "arc-testnet", chainId: 5042002, rpc: RPC },
    guard: {
      address: GUARD,
      explorer: EXPLORER_ADDR + GUARD,
      token: addr(G.token),
      owner: guardOwner,
      ownerIsMultisig: guardOwner === null ? null : guardOwner === MULTISIG,
      operator: operatorAddr,
      guardian: guardianAddr,
      recovery: recoveryAddr,
      perTxCapUsdc: perTx,
      dailyCapUsdc: daily,
      hardPerTxCapUsdc: maxPerTx,
      hardDailyCapUsdc: maxDaily,
      spentInWindowUsdc: usdc(G.spentInWindow),
      availableUsdc: usdc(G.available),
      windowStart: num(G.windowStart),
      paused: G.paused === null || G.paused === undefined ? null : !!G.paused,
      timelockDelaySeconds: delay,
      note: "Every privileged setter is onlyThis: the owner can only queue an operation, wait out timelockDelay, then execute it. Hard caps and the recovery sink are immutable and outlive any owner.",
    },
    multisig: {
      address: MULTISIG,
      explorer: EXPLORER_ADDR + MULTISIG,
      threshold,
      ownersCount,
      owners: ownerList,
      txCount,
      pendingCount: pending.length,
      pending,
      scanned: txsSeen.length,
      note: "Owners and threshold change only through a confirmed transaction to the multisig itself; there is no admin backdoor.",
    },
    invariants,
    knownGaps,
    unread: r.unread,
    complete: r.unread.length === 0,
    honesty: "Every field is read live from Arc with eth_call and no keys. A value the node refused is listed under unread and its invariant reads unknown, never satisfied. A control that is weaker than the documentation claims is listed under knownGaps rather than left for a reader to discover.",
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  try {
    const fresh = String((req.query && req.query.fresh) || "") === "1"
    if (!fresh) {
      const hit = await kvCmd(["GET", CACHE_KEY])
      if (hit) {
        try {
          const obj = typeof hit === "string" ? JSON.parse(hit) : hit
          const age = Math.round((Date.now() - Number(obj.cachedAt || 0)) / 1000)
          if (obj && obj.body && age <= TTL_SECONDS) {
            return res.status(200).json({ ...obj.body, cache: { hit: true, stale: false, ageSeconds: age, ttlSeconds: TTL_SECONDS, note: "read from Arc " + age + "s ago; add ?fresh=1 to re-read now." } })
          }
        } catch (_) {}
      }
    }
    const out = await resolveGovernance()
    if (out.complete) await kvCmd(["SET", CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), body: out }), "EX", String(STALE_MAX_SECONDS)])
    return res.status(200).json({ ...out, cache: { hit: false, stale: false, ageSeconds: 0, ttlSeconds: TTL_SECONDS } })
  } catch (e) {
    const last = await kvCmd(["GET", CACHE_KEY])
    if (last) {
      try {
        const obj = typeof last === "string" ? JSON.parse(last) : last
        const age = Math.round((Date.now() - Number(obj.cachedAt || 0)) / 1000)
        if (obj && obj.body) {
          return res.status(200).json({ ...obj.body, cache: { hit: true, stale: true, ageSeconds: age, ttlSeconds: TTL_SECONDS, note: "Arc could not be read for this request; this is the last successful read, " + age + "s old." }, degraded: { reason: "arc_rpc_unavailable", detail: String((e && e.message) || e) } })
        }
      } catch (_) {}
    }
    return res.status(503).json({ ok: false, error: "governance state could not be read from Arc", detail: String((e && e.message) || e) })
  }
}
