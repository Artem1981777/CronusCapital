// lib/bridgeExec.js — LIVE autonomous cross-chain USDC bridge from Arc via Circle CCTP.
// Two honest directions, selected by `dest`:
//   - dest=<EVM chain name> (baseSepolia, sepolia, ...): depositForBurn; mint completes on
//     the destination EVM chain via Circle attestation relay.
//   - dest="stellar": depositForBurnWithHook to the Soroban CCTP forwarder; the final
//     Stellar recipient (G...) rides in hookData. Attestation via /api/cctp-status, mint via
//     /api/complete-stellar. EVM constants come from lib/withdraw.js, Stellar constants from
//     api/agent-payout.js (live payout path). Nothing is guessed.
// Routed via /api/info?kind=bridge (no new serverless function). DRY-RUN BY DEFAULT.
// Guards: execKey (CRONUS_EXEC_SECRET) + per-bridge USDC cap + shared daily breaker +
// timestamp rate limiter (1/min, not a TTL lock) + on-chain simulate.
import { createWalletClient, createPublicClient, http, defineChain } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { buildBurnArgs, CCTP_DEPOSIT_FOR_BURN_ABI, DEST_USDC, supportedChains } from "./withdraw.js"
import { checkDaily, recordDaily } from "./breaker.js"
import { emergencyPaused, pauseError } from "./guard.js"

const ARC_USDC = "0x3600000000000000000000000000000000000000"
const ARC_TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA"
const ARC_RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const ARCSCAN = "https://testnet.arcscan.app/tx/"
const ARC_CHAIN_ID = 5042002
const MAX_UINT = (2n ** 256n) - 1n

const STELLAR_FORWARDER = process.env.CCTP_STELLAR_FORWARDER || "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ"
const STELLAR_DOMAIN = Number(process.env.CCTP_STELLAR_DOMAIN || "27")
const G_RE = /^G[A-Z2-7]{55}$/
const ALLOW_EVM = String(process.env.TREASURY_ALLOWLIST || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd,0x6829860b7f61FA01E5bf3D194d9f780ACa5B6787").split(",").map(function (x) { return x.trim().toLowerCase() }).filter(Boolean)
const ALLOW_STELLAR = String(process.env.TREASURY_ALLOWLIST_STELLAR || "GBNJ2JNNLKQ53MO353PPOTNKI47DMHWVULKXMJMNLQWPF3FBIOA2CAZK").split(",").map(function (x) { return x.trim() }).filter(Boolean)
function isBridgeAllowlisted(to) {
  if (typeof to !== "string" || !to) return false
  if (/^0x[0-9a-fA-F]{40}$/.test(to)) return ALLOW_EVM.indexOf(to.toLowerCase()) !== -1
  if (/^G[A-Z2-7]{55}$/.test(to)) return ALLOW_STELLAR.indexOf(to) !== -1
  return false
}

const KV_URL = process.env.KV_REST_API_URL || ""
const KV_TOKEN = process.env.KV_REST_API_TOKEN || ""
const RATE_KEY = "cronus:bridge:last"
const RATE_WINDOW_MS = 60000

const arcChain = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
})

const SOURCES = {
  arc: { chainId: ARC_CHAIN_ID, rpc: ARC_RPC, usdc: ARC_USDC, tokenMessenger: ARC_TOKEN_MESSENGER, explorer: ARCSCAN, name: "Arc Testnet", native: { name: "USDC", symbol: "USDC", decimals: 18 } },
  baseSepolia: { chainId: 84532, rpc: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org", usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA", explorer: "https://sepolia.basescan.org/tx/", name: "Base Sepolia", native: { name: "Ether", symbol: "ETH", decimals: 18 } },
}
function srcChain(sc) { return defineChain({ id: sc.chainId, name: sc.name, nativeCurrency: sc.native, rpcUrls: { default: { http: [sc.rpc] } } }) }

const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
]

const TM_HOOK_ABI = [
  { type: "function", name: "depositForBurnWithHook", stateMutability: "nonpayable", inputs: [
    { name: "amount", type: "uint256" },
    { name: "destinationDomain", type: "uint32" },
    { name: "mintRecipient", type: "bytes32" },
    { name: "burnToken", type: "address" },
    { name: "destinationCaller", type: "bytes32" },
    { name: "maxFee", type: "uint256" },
    { name: "minFinalityThreshold", type: "uint32" },
    { name: "hookData", type: "bytes" },
  ], outputs: [] },
]

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
function base32Decode(s) {
  let bits = 0, value = 0
  const out = []
  for (const ch of s) {
    const idx = B32.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) { bits -= 8; out.push((value >> bits) & 0xff) }
  }
  return new Uint8Array(out)
}
function hx(bytes) { let h = ""; for (const b of bytes) h += b.toString(16).padStart(2, "0"); return h }
function strkeyToBytes32(strkey) { const raw = base32Decode(strkey.trim()); return "0x" + hx(raw.slice(1, 33)) }
function buildHookData(gAddr) {
  const rb = new TextEncoder().encode(gAddr.trim())
  const buf = new Uint8Array(32 + rb.length)
  const L = rb.length
  buf[28] = (L >>> 24) & 0xff; buf[29] = (L >>> 16) & 0xff; buf[30] = (L >>> 8) & 0xff; buf[31] = L & 0xff
  buf.set(rb, 32)
  return "0x" + hx(buf)
}

function normPk(pk) { const t = (pk || "").trim(); if (!t) return ""; return t.indexOf("0x") === 0 ? t : "0x" + t }
function toUnits(amount, decimals) {
  const s = String(amount).trim()
  if (!s) return 0n
  const parts = s.split(".")
  const whole = parts[0] || "0"
  let frac = parts[1] || ""
  frac = (frac + "0".repeat(decimals)).slice(0, decimals)
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(frac || "0")
}
function safeJson(v) { if (!v) return {}; if (typeof v === "object") return v; try { return JSON.parse(v) } catch { return {} } }

async function kvCmd(path) {
  if (!KV_URL || !KV_TOKEN) return null
  try {
    const r = await fetch(KV_URL + path, { headers: { Authorization: "Bearer " + KV_TOKEN } })
    if (!r.ok) return null
    const j = await r.json()
    return j.result
  } catch { return null }
}
async function kvGet(key) { return await kvCmd("/get/" + encodeURIComponent(key)) }
async function kvSet(key, val) { return await kvCmd("/set/" + encodeURIComponent(key) + "/" + encodeURIComponent(val)) }

function signerAddress() {
  const pk = normPk(process.env.TREASURY_PRIVATE_KEY)
  if (!pk) return null
  try { return privateKeyToAccount(pk).address } catch { return null }
}

function readExecKey(req, b) {
  const h = req.headers || {}
  const auth = typeof h.authorization === "string" ? h.authorization : ""
  return String(b.execKey || h["x-exec-key"] || h["x-cronus-exec"] || (auth.indexOf("Bearer ") === 0 ? auth.slice(7) : "") || "")
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-exec-key,x-cronus-exec")
  if (req.method === "OPTIONS") { res.status(200).end(); return }

  const method = (req.method || "GET").toUpperCase()
  const capAtomic = BigInt(process.env.BRIDGE_CAP_ATOMIC || "5000000")

  if (method === "GET") {
    return res.status(200).json({
      ok: true,
      endpoint: "cronus_bridge",
      rail: "cctp-depositForBurn",
      source: "Arc testnet (CCTP domain 26)",
      destinations: { evm: supportedChains(), stellar: { domain: STELLAR_DOMAIN, forwarder: STELLAR_FORWARDER, recipient: "Stellar G-address (carried in hookData)" } },
      perBridgeCapAtomic: String(capAtomic),
      rateLimit: "1 bridge per minute",
      dryRunDefault: true,
      execGated: true,
      signer: signerAddress(),
      honesty: "Burn is signed by the Cronus treasury and verifiable on arcscan. EVM mint completes via Circle CCTP attestation relay; Stellar mint completes via /api/cctp-status + /api/complete-stellar. No destination tx hash is fabricated. Pass execute:true + execKey for a real burn (bounded by per-bridge cap + shared daily breaker + rate limit).",
    })
  }

  if (method !== "POST") return res.status(405).json({ ok: false, error: "method not allowed" })

  const b = safeJson(req.body)
  const dest = String(b.dest || b.destChain || b.chain || "").trim()
  const source = String(b.source || b.sourceChain || "arc").trim()
  const src = SOURCES[source]
  if (!src) return res.status(400).json({ ok: false, error: "unsupported source chain: " + source + " (supported: arc, baseSepolia)" })
  const to = String(b.to || b.recipient || "").trim()
  const amount = b.amount
  const execute = b.execute === true || b.execute === "true" || b.execute === 1

  if (!dest || !to || amount === undefined || amount === null || amount === "") {
    return res.status(400).json({ ok: false, error: "required: dest ('stellar' or an EVM chain name), to (recipient), amount (USDC)" })
  }

  const amtAtomic = toUnits(amount, 6)
  if (amtAtomic <= 0n) return res.status(400).json({ ok: false, error: "amount rounds to zero" })
  if (amtAtomic > capAtomic) return res.status(400).json({ ok: false, error: "amount exceeds per-bridge cap", capAtomic: String(capAtomic), requestedAtomic: String(amtAtomic) })

  const isStellar = dest.toLowerCase() === "stellar"
  if (isStellar && source !== "arc") return res.status(400).json({ ok: false, error: "stellar destination is only supported from source=arc" })
  const maxFeeAtomic = (b.maxFee === undefined || b.maxFee === null || b.maxFee === "") ? (amtAtomic / 100n) : toUnits(b.maxFee, 6)
  if (maxFeeAtomic >= amtAtomic) return res.status(400).json({ ok: false, error: "maxFee must be < amount" })

  let planOut, burnAbi, burnArgs
  if (isStellar) {
    if (!G_RE.test(to)) return res.status(400).json({ ok: false, error: "stellar recipient must be a Stellar G-address (G + 55 base32 chars)" })
    const fwd = strkeyToBytes32(STELLAR_FORWARDER)
    const hook = buildHookData(to)
    burnAbi = TM_HOOK_ABI
    burnArgs = [amtAtomic, STELLAR_DOMAIN, fwd, ARC_USDC, fwd, maxFeeAtomic, 2000, hook]
    planOut = { rail: "cctp-depositForBurnWithHook", dest: "stellar", domain: STELLAR_DOMAIN, recipient: to, forwarder: STELLAR_FORWARDER, mintRecipient: fwd, destinationCaller: fwd, burnToken: ARC_USDC, tokenMessenger: ARC_TOKEN_MESSENGER, amountAtomic: String(amtAtomic), maxFeeAtomic: String(maxFeeAtomic), minFinalityThreshold: 2000, mint: "poll /api/cctp-status then POST /api/complete-stellar (mint_and_forward)" }
  } else {
    let plan
    try { plan = buildBurnArgs({ amountAtomic: String(amtAtomic), destChain: dest, recipient: to, maxFeeAtomic: String(maxFeeAtomic), burnToken: src.usdc }) }
    catch (e) { return res.status(400).json({ ok: false, error: String((e && e.message) || e) }) }
    burnAbi = CCTP_DEPOSIT_FOR_BURN_ABI
    burnArgs = plan.args
    planOut = { rail: "cctp-depositForBurn", dest, domain: plan.domain, recipient: to, mintRecipient: plan.mintRecipient, destinationCaller: plan.destinationCaller, burnToken: plan.burnToken, tokenMessenger: ARC_TOKEN_MESSENGER, amountAtomic: String(amtAtomic), maxFeeAtomic: String(plan.maxFee), minFinalityThreshold: plan.minFinalityThreshold, destUsdc: DEST_USDC[dest] || null, mint: "Circle CCTP attestation relay mints USDC on " + dest }
  }

  if (!execute) {
    return res.status(200).json({ ok: true, dryRun: true, plan: planOut, note: "dry-run only; no funds moved. Re-send with execute:true and a valid execKey to submit the burn." })
  }

  if (emergencyPaused()) return res.status(503).json(Object.assign({ ok: false }, pauseError()))
  if (!isBridgeAllowlisted(to)) return res.status(403).json({ ok: false, error: "recipient not in Cronus treasury allowlist", to: to })
  const execSecret = process.env.CRONUS_BRIDGE_EXEC_SECRET || process.env.CRONUS_EXEC_SECRET || ""
  if (!execSecret) return res.status(503).json({ ok: false, error: "execute disabled: CRONUS_EXEC_SECRET not configured" })
  if (readExecKey(req, b) !== execSecret) return res.status(401).json({ ok: false, error: "execute requires a valid execKey" })

  const pk = normPk(process.env.TREASURY_PRIVATE_KEY)
  if (!pk) return res.status(500).json({ ok: false, error: "TREASURY_PRIVATE_KEY not set" })

  const kvOn = Boolean(KV_URL && KV_TOKEN)
  if (kvOn) {
    const last = await kvGet(RATE_KEY)
    const lastMs = last ? Number(last) : 0
    if (lastMs && (Date.now() - lastMs) < RATE_WINDOW_MS) {
      return res.status(429).json({ ok: false, error: "rate limited: 1 bridge per minute", retryAfterMs: RATE_WINDOW_MS - (Date.now() - lastMs) })
    }
    await kvSet(RATE_KEY, String(Date.now()))
  }

  const gate = await checkDaily(String(amtAtomic))
  if (!gate.allowed && !gate.unavailable) {
    if (kvOn) await kvSet(RATE_KEY, "0")
    return res.status(429).json({ ok: false, error: "daily spend breaker tripped", remainingAtomic: String(gate.remainingAtomic), dailyCapAtomic: String(gate.dailyCapAtomic) })
  }

  try {
    const account = privateKeyToAccount(pk)
    const publicClient = createPublicClient({ chain: srcChain(src), transport: http(src.rpc) })
    const walletClient = createWalletClient({ account, chain: srcChain(src), transport: http(src.rpc) })

    let allowance = 0n
    try { allowance = await publicClient.readContract({ address: src.usdc, abi: ERC20_ABI, functionName: "allowance", args: [account.address, src.tokenMessenger] }) } catch { allowance = 0n }
    if (allowance < amtAtomic) {
      const approveHash = await walletClient.writeContract({ address: src.usdc, abi: ERC20_ABI, functionName: "approve", args: [src.tokenMessenger, MAX_UINT] })
      try { await publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 45000 }) }
      catch {
        if (kvOn) await kvSet(RATE_KEY, "0")
        return res.status(202).json({ ok: false, executed: false, pending: "approval submitted; retry execute in about 30 seconds", approveTx: approveHash, signer: account.address })
      }
    }

    const fnName = isStellar ? "depositForBurnWithHook" : "depositForBurn"
    const sim = await publicClient.simulateContract({ account, address: src.tokenMessenger, abi: burnAbi, functionName: fnName, args: burnArgs })
    const burnHash = await walletClient.writeContract(sim.request)
    await recordDaily(String(amtAtomic)).catch(() => null)

    return res.status(200).json({
      ok: true,
      executed: true,
      rail: planOut.rail,
      dest,
      burnTx: burnHash,
      explorer: src.explorer + burnHash,
      signer: account.address,
      recipient: to,
      amountAtomic: String(amtAtomic),
      mint: isStellar
        ? { status: "pending_attestation", next: "poll /api/cctp-status?txHash=" + burnHash + " until complete, then POST /api/complete-stellar to mint_and_forward on Stellar", note: "Burn on Arc verifiable on arcscan; Stellar mint is a separate attested step, not fabricated." }
        : { status: "pending_attestation", note: "Burn on " + src.name + " verifiable on its explorer; USDC mint on " + dest + " completes after Circle CCTP attestation, not fabricated." },
    })
  } catch (e) {
    if (kvOn) await kvSet(RATE_KEY, "0")
    const msg = (e && e.shortMessage) || (e && e.message) || "execution failed"
    return res.status(500).json({ ok: false, executed: false, error: String(msg).slice(0, 300) })
  }
}
