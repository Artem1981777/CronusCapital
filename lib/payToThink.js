// lib/payToThink.js — "Cronus pays to think": LIVE settlement of upstream data purchases on Arc.
// GET (no auth) = transparency: config + recent settled COGS from a SEPARATE KV namespace
//   (cronus:cogs:*), so it NEVER touches the x402 receipts/metrics/traction honesty ledgers.
// POST action=preview (no auth, no funds) = dry-run purchase decision.
// POST action=execute (Bearer CRON_SECRET) = REAL USDC transfer on Arc testnet to the upstream
//   provider, drawn down against the shared daily spend breaker + a per-tx cap. Signs with
//   STAKE_PRIVATE_KEY (NOT the treasury payTo) so the public receipts feed is unaffected.
// HONESTY: upstream providers are self-operated demo counterparties on testnet; every settled
//   entry is labeled self_operated_demo:true and is Cronus's COST (COGS), never external demand.
import { createWalletClient, createPublicClient, http, defineChain, erc20Abi, getAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { checkDaily, recordDaily } from "./breaker.js"
import { dataMarketEnabled, liveSettlementEnabled, parseSources, decideDataPurchase, recordUpstreamPayment } from "./dataMarket.js"

const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID || "5042002")
const ARC_RPC = process.env.ARC_RPC || process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"
const EXPLORER = process.env.ARC_EXPLORER || "https://testnet.arcscan.app"
const USDC_ADDRESS = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000")
const PER_TX_CAP = process.env.PAY_TO_THINK_PER_TX_CAP_ATOMIC || "50000"
const LOG_KEY = "cronus:cogs:log"
const LOCK_KEY = "cronus:cogs:lock"
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
function readBody(req) {
  if (req.body) { if (typeof req.body === "string") { try { return JSON.parse(req.body) } catch (_) { return {} } } return req.body }
  return {}
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization")
  if (req.method === "OPTIONS") { res.status(200).end(); return }

  const sources = parseSources(process.env.CRONUS_UPSTREAM_SOURCES)

  if (req.method !== "POST") {
    const logRaw = await kvCmd(["LRANGE", LOG_KEY, "0", "19"])
    const log = Array.isArray(logRaw) ? logRaw.map((s) => { try { return typeof s === "string" ? JSON.parse(s) : s } catch (_) { return null } }).filter(Boolean) : []
    const settledAtomic = log.reduce((n, e) => n + (e && e.mode === "settled" ? Math.floor(Number(e.amountAtomic) || 0) : 0), 0)
    res.status(200).json({
      ok: true, mode: "config",
      enabled: dataMarketEnabled(process.env),
      settlement: liveSettlementEnabled(process.env) ? "armed" : "disabled",
      perTxCapAtomic: String(PER_TX_CAP),
      sources: sources.map((s) => ({ id: s.id, label: s.label, priceUsdAtomic: s.priceUsdAtomic, recipient: s.recipient })),
      settled_cogs_atomic: settledAtomic,
      recent: log,
      honesty: "Upstream providers are self-operated demo counterparties on Arc testnet. Entries are Cronus cost-of-goods (COGS), tracked in a separate ledger and never counted as external demand or x402 revenue.",
      note: "POST action=preview {conviction} for a no-funds decision. POST action=execute (Bearer CRON_SECRET) settles a real testnet USDC payment to the chosen upstream provider.",
    })
    return
  }

  const body = readBody(req)
  const action = String((req.query && req.query.action) || body.action || "preview").toLowerCase()
  const conviction = Number(body.conviction != null ? body.conviction : 60)
  const decision = decideDataPurchase({ enabled: dataMarketEnabled(process.env) || body.force === true, conviction, sources, budgetAtomic: Infinity })

  if (action === "preview") {
    res.status(200).json({ ok: true, action: "preview", buy: decision.buy, decision: decision.reason, source: decision.source || null })
    return
  }

  const secret = process.env.CRON_SECRET || ""
  const auth = (req.headers && req.headers.authorization) || ""
  if (!secret || auth !== "Bearer " + secret) { res.status(401).json({ ok: false, error: "unauthorized" }); return }

  if (action !== "execute") { res.status(400).json({ ok: false, error: "unknown action: " + action }); return }
  if (!liveSettlementEnabled(process.env)) { res.status(409).json({ ok: false, error: "live settlement disabled; set PAY_TO_THINK_LIVE=1" }); return }

  let source = decision.source
  if (body.sourceId) source = sources.find((s) => s.id === body.sourceId) || source
  if (!source && !body.to) { res.status(400).json({ ok: false, error: "no upstream source to pay (configure CRONUS_UPSTREAM_SOURCES)" }); return }

  let to
  try { to = getAddress(String(body.to || (source && source.recipient))) } catch (_) { res.status(400).json({ ok: false, error: "invalid recipient" }); return }
  const PROTECTED = [process.env.CRONUS_PAYTO, process.env.PAY_TO, process.env.TREASURY_ADDRESS].filter(Boolean).map((a) => String(a).toLowerCase())
  if (PROTECTED.includes(to.toLowerCase())) { res.status(400).json({ ok: false, error: "recipient must not be the x402 payTo/treasury (keeps receipts honest)" }); return }

  const amt = BigInt(body.amountAtomic || (source && source.priceUsdAtomic) || "0")
  if (amt <= 0n) { res.status(400).json({ ok: false, error: "amount must be > 0" }); return }
  if (amt > BigInt(PER_TX_CAP)) { res.status(400).json({ ok: false, error: "exceeds per-tx cap " + PER_TX_CAP }); return }

  const gate = await checkDaily(String(amt))
  if (!gate.allowed) { res.status(409).json({ ok: false, error: "daily breaker: " + gate.reason, breaker: gate }); return }

  const pk = normPk(process.env.STAKE_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY)
  if (!pk) { res.status(500).json({ ok: false, error: "STAKE_PRIVATE_KEY not set" }); return }

  const lock = await kvCmd(["SET", LOCK_KEY, "1", "NX", "EX", "60"])
  if (lock !== "OK") { res.status(409).json({ ok: false, error: "settlement already in progress" }); return }
  try {
    const account = privateKeyToAccount(pk)
    const publicClient = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })
    const walletClient = createWalletClient({ account, chain: arcChain, transport: http(ARC_RPC) })
    const hash = await walletClient.writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "transfer", args: [to, amt] })
    const rc = await publicClient.waitForTransactionReceipt({ hash })
    await recordDaily(String(amt))
    const base = source ? recordUpstreamPayment(source, { live: true, txRef: hash }) : { sourceId: "adhoc", label: "adhoc", priceUsdAtomic: Number(amt), recipient: to, mode: "settled", txRef: hash }
    const entry = Object.assign({}, base, { amountAtomic: String(amt), to, from: account.address, self_operated_demo: true, explorer: EXPLORER + "/tx/" + hash, status: rc.status, at: Date.now() })
    await kvCmd(["LPUSH", LOG_KEY, JSON.stringify(entry)])
    await kvCmd(["LTRIM", LOG_KEY, "0", "99"])
    res.status(200).json({ ok: true, action: "execute", settled: entry })
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e && e.message) || e) })
  } finally {
    await kvCmd(["DEL", LOCK_KEY])
  }
}
