// lib/resolveStake.js — server-side honest resolver for skin-in-the-game stakes.
// At/after resolveBy, fetch OKX last price, compare to pre-committed openPrice per the position's own rule,
// then settle verifiably from the escrow wallet: correct -> stake returned to staking signer; wrong -> burned (0x..dEaD).
// GET = no-funds dry-run preview. POST (Bearer CRON_SECRET) = execute. Signs with ESCROW_PRIVATE_KEY.
// Routed as /api/resolve-stake via vercel.json -> /api/info?kind=resolve-stake.
import { createWalletClient, createPublicClient, http, defineChain, erc20Abi, getAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID || "5042002")
const ARC_RPC = process.env.ARC_RPC || process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"
const USDC_ADDRESS = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000")
const EXPLORER = process.env.ARC_EXPLORER || "https://testnet.arcscan.app"
const BURN = "0x000000000000000000000000000000000000dEaD"
const ESCROW_EXPECT = process.env.STAKE_ESCROW ? String(process.env.STAKE_ESCROW).toLowerCase() : null
const LEDGER_KEY = "cronus:stakes:ledger"
const arcChain = defineChain({ id: ARC_CHAIN_ID, name: "arc-testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [ARC_RPC] } } })

function normPk(pk) { if (!pk) return null; return pk.startsWith("0x") ? pk : "0x" + pk }

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

async function okxLast(instId) {
  try {
    const r = await fetch("https://www.okx.com/api/v5/market/ticker?instId=" + encodeURIComponent(instId))
    const j = await r.json()
    const px = j && j.data && j.data[0] ? Number(j.data[0].last) : NaN
    return isFinite(px) && px > 0 ? px : null
  } catch (_) { return null }
}

function instrumentOf(p) {
  if (p && p.marketId && String(p.marketId).indexOf(":") > 0) return String(p.marketId).split(":")[0]
  return null
}

function decideCorrect(verdict, openPrice, last) {
  if (String(verdict).toUpperCase() === "YES") return last > openPrice
  return last < openPrice
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization")
  if (req.method === "OPTIONS") { res.status(200).end(); return }

  const now = Date.now()
  const raw = await kvCmd(["LRANGE", LEDGER_KEY, "0", "199"])
  const list = Array.isArray(raw) ? raw : []
  const parsed = []
  for (let i = 0; i < list.length; i++) {
    try { parsed.push({ i: i, p: typeof list[i] === "string" ? JSON.parse(list[i]) : list[i] }) } catch (_) {}
  }
  const due = parsed.filter((x) => String((x.p && x.p.status) || "open").toLowerCase() === "open" && Number(x.p && x.p.resolveBy) <= now)
  const isPost = req.method === "POST"

  const pk = normPk(process.env.ESCROW_PRIVATE_KEY)
  let escrowAddr = null, escrowNative = "0", escrowUsdc = "0", signerOk = false
  if (pk) {
    try {
      const acct = privateKeyToAccount(pk)
      escrowAddr = acct.address
      signerOk = ESCROW_EXPECT ? acct.address.toLowerCase() === ESCROW_EXPECT : true
      const pub = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })
      try { escrowNative = String(await pub.getBalance({ address: acct.address })) } catch (_) {}
      try { escrowUsdc = String(await pub.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [acct.address] })) } catch (_) {}
    } catch (_) {}
  }

  if (!isPost) {
    const previews = []
    for (const x of due) {
      const p = x.p
      const inst = instrumentOf(p)
      const last = inst ? await okxLast(inst) : null
      const ready = last != null && typeof p.openPrice === "number"
      previews.push({ id: p.id, marketId: p.marketId, verdict: p.verdict, instrument: inst, openPrice: p.openPrice, lastPrice: last, stakeAtomic: p.stakeAtomic, wouldBe: ready ? (decideCorrect(p.verdict, p.openPrice, last) ? "correct" : "wrong") : "unresolvable(no price)", resolveBy: p.resolveBy })
    }
    res.status(200).json({ ok: true, mode: "dry-run", now: now, open_total: parsed.filter((x) => String((x.p && x.p.status) || "open").toLowerCase() === "open").length, due_count: due.length, previews: previews, escrow: { configured: ESCROW_EXPECT, signer: escrowAddr, signerMatchesEscrow: signerOk, keySet: Boolean(pk), nativeWei: escrowNative, usdc6: escrowUsdc }, note: "GET is a no-funds preview. POST with Bearer CRON_SECRET settles due positions from escrow." })
    return
  }

  const secret = process.env.CRON_SECRET || ""
  const auth = (req.headers && req.headers.authorization) || ""
  if (!secret || auth !== "Bearer " + secret) { res.status(401).json({ ok: false, error: "unauthorized" }); return }
  if (!pk) { res.status(500).json({ ok: false, error: "ESCROW_PRIVATE_KEY not set" }); return }
  const account = privateKeyToAccount(pk)
  if (ESCROW_EXPECT && account.address.toLowerCase() !== ESCROW_EXPECT) { res.status(409).json({ ok: false, error: "escrow signer " + account.address + " != expected escrow " + ESCROW_EXPECT }); return }
  if (due.length === 0) { res.status(200).json({ ok: true, resolved: [], note: "no positions due for resolution" }); return }

  const lock = await kvCmd(["SET", "cronus:stakes:resolve_lock", "1", "NX", "EX", "120"])
  if (lock !== "OK") { res.status(409).json({ ok: false, error: "resolve already in progress" }); return }
  const results = []
  try {
    const publicClient = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })
    const walletClient = createWalletClient({ account: account, chain: arcChain, transport: http(ARC_RPC) })
    for (const x of due) {
      const p = x.p
      const inst = instrumentOf(p)
      const last = inst ? await okxLast(inst) : null
      if (last == null || typeof p.openPrice !== "number") { results.push({ id: p.id, skipped: "no price", instrument: inst }); continue }
      const amount = BigInt(p.stakeAtomic || "0")
      if (amount <= 0n) { results.push({ id: p.id, skipped: "zero stake" }); continue }
      const correct = decideCorrect(p.verdict, p.openPrice, last)
      const dest = correct ? getAddress(p.signer) : getAddress(BURN)
      let hash = null
      try {
        hash = await walletClient.writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "transfer", args: [dest, amount] })
        const rc = await publicClient.waitForTransactionReceipt({ hash: hash })
        if (rc.status !== "success") { results.push({ id: p.id, error: "resolve tx reverted", resolveTx: hash }); continue }
      } catch (e) { results.push({ id: p.id, error: String((e && e.message) || e) }); continue }
      const updated = Object.assign({}, p, { status: correct ? "correct" : "wrong", resolvePrice: last, resolveTx: hash, resolvedAt: Date.now(), settledTo: dest.toLowerCase() })
      await kvCmd(["LSET", LEDGER_KEY, String(x.i), JSON.stringify(updated)])
      results.push({ id: p.id, marketId: p.marketId, verdict: p.verdict, openPrice: p.openPrice, lastPrice: last, outcome: correct ? "correct" : "wrong", settledTo: dest.toLowerCase(), amountAtomic: String(amount), resolveTx: hash, explorer: EXPLORER + "/tx/" + hash })
    }
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e && e.message) || e), partial: results }); return
  } finally {
    await kvCmd(["DEL", "cronus:stakes:resolve_lock"])
  }
  res.status(200).json({ ok: true, resolved: results, count: results.length })
}
