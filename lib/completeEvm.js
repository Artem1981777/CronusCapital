// lib/completeEvm.js — EVM CCTP completer: Arc burn -> receiveMessage mint on destination EVM.
// Mirrors api/complete-stellar.js but mints via MessageTransmitterV2.receiveMessage (viem).
// Routed via /api/info?kind=complete-evm (NO new serverless fn; Hobby 12-fn cap respected).
// Signer: TREASURY_PRIVATE_KEY pays destination gas. Idempotent via KV. No tx is fabricated.
import { createWalletClient, createPublicClient, http, defineChain } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const IRIS = process.env.CCTP_IRIS_URL || "https://iris-api-sandbox.circle.com"
const ARC_DOMAIN = Number(process.env.CCTP_ARC_DOMAIN || "26")
const MESSAGE_TRANSMITTER = process.env.CCTP_MESSAGE_TRANSMITTER || "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275"
const HASH_RE = /^0x[0-9a-fA-F]{64}$/
const KV_URL = process.env.KV_REST_API_URL || ""
const KV_TOKEN = process.env.KV_REST_API_TOKEN || ""

const EVM_DESTS = {
  baseSepolia:     { domain: 6,  chainId: 84532,    rpc: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",                    explorer: "https://sepolia.basescan.org/tx/",          name: "Base Sepolia" },
  sepolia:         { domain: 0,  chainId: 11155111, rpc: process.env.ETH_SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io/tx/",          name: "Ethereum Sepolia" },
  arbitrumSepolia: { domain: 3,  chainId: 421614,   rpc: process.env.ARB_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc",       explorer: "https://sepolia.arbiscan.io/tx/",           name: "Arbitrum Sepolia" },
  optimismSepolia: { domain: 2,  chainId: 11155420, rpc: process.env.OP_SEPOLIA_RPC || "https://sepolia.optimism.io",                   explorer: "https://sepolia-optimism.etherscan.io/tx/", name: "OP Sepolia" },
}
const DOMAIN_TO_DEST = { 6: "baseSepolia", 0: "sepolia", 3: "arbitrumSepolia", 2: "optimismSepolia" }

const RECEIVE_ABI = [
  { type: "function", name: "receiveMessage", stateMutability: "nonpayable", inputs: [ { name: "message", type: "bytes" }, { name: "attestation", type: "bytes" } ], outputs: [ { name: "", type: "bool" } ] },
]

function normPk(pk) { const t = (pk || "").trim(); if (!t) return ""; return t.indexOf("0x") === 0 ? t : "0x" + t }
async function fetchT(url, opts, ms) {
  const c = new AbortController()
  const t = setTimeout(function () { c.abort() }, ms || 8000)
  try { return await fetch(url, Object.assign({}, opts || {}, { signal: c.signal })) } finally { clearTimeout(t) }
}
async function kvCmd(path) {
  if (!KV_URL || !KV_TOKEN) return null
  try { const r = await fetchT(KV_URL + path, { headers: { Authorization: "Bearer " + KV_TOKEN } }, 4000); if (!r.ok) return null; const j = await r.json(); return j.result } catch { return null }
}
async function kvGet(key) { return await kvCmd("/get/" + encodeURIComponent(key)) }
async function kvSetEx(key, val, ttl) { return await kvCmd("/set/" + encodeURIComponent(key) + "/" + encodeURIComponent(val) + "?EX=" + ttl) }
async function kvIncrEx(key, ttl) { const n = await kvCmd("/incr/" + encodeURIComponent(key)); if (n === 1) await kvCmd("/expire/" + encodeURIComponent(key) + "/" + ttl); return n }
async function getAttestation(txHash) {
  const url = IRIS + "/v2/messages/" + ARC_DOMAIN + "?transactionHash=" + txHash
  const r = await fetchT(url, {}, 8000)
  if (!r.ok) return { ok: false, code: r.status }
  const j = await r.json()
  return { ok: true, msg: j && j.messages && j.messages[0] }
}
function clientIp(req) { const xf = req.headers["x-forwarded-for"]; if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim(); return "unknown" }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") { res.status(200).end(); return }

  const txHash = (req.query && req.query.txHash) || (req.body && req.body.txHash) || ""
  if (!HASH_RE.test(txHash)) { res.status(400).json({ status: "bad_request", detail: "invalid txHash (Arc burn tx, 0x + 64 hex)" }); return }

  const ip = clientIp(req)
  const rl = await kvIncrEx("rl:complete-evm:" + ip, 60)
  if (typeof rl === "number" && rl > 10) { res.status(429).json({ status: "rate_limited", detail: "too many requests, retry in a minute" }); return }

  const cacheKey = "complete-evm:" + txHash
  const cached = await kvGet(cacheKey)
  if (cached) { try { const c = JSON.parse(cached); res.status(200).json(Object.assign({ cached: true }, c)); return } catch {} }

  const att = await getAttestation(txHash)
  if (!att.ok) { res.status(502).json({ status: "iris_error", code: att.code }); return }
  const m = att.msg
  if (!m || m.status !== "complete" || !m.message || !m.attestation || m.attestation === "PENDING") { res.status(200).json({ status: "pending", detail: "attestation not ready, retry shortly" }); return }

  const reqDest = String((req.query && req.query.dest) || (req.body && req.body.dest) || "").trim()
  const destName = (reqDest && EVM_DESTS[reqDest]) ? reqDest : DOMAIN_TO_DEST[Number(m.destinationDomain)]
  const dest = destName ? EVM_DESTS[destName] : null
  if (!dest) { res.status(400).json({ status: "unsupported_destination", detail: "destinationDomain " + m.destinationDomain + " has no EVM completer target", destinationDomain: m.destinationDomain }); return }

  const pk = normPk(process.env.TREASURY_PRIVATE_KEY)
  if (!pk) { res.status(500).json({ status: "signer_unset", detail: "TREASURY_PRIVATE_KEY not set" }); return }

  const chain = defineChain({ id: dest.chainId, name: dest.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [dest.rpc] } } })
  const account = privateKeyToAccount(pk)
  const publicClient = createPublicClient({ chain, transport: http(dest.rpc) })
  const walletClient = createWalletClient({ account, chain, transport: http(dest.rpc) })

  let sim
  try {
    sim = await publicClient.simulateContract({ account, address: MESSAGE_TRANSMITTER, abi: RECEIVE_ABI, functionName: "receiveMessage", args: [m.message, m.attestation] })
  } catch (e) {
    const detail = String((e && e.shortMessage) || (e && e.message) || e)
    if (/already|used|nonce|replay|spent/i.test(detail)) { const done = { status: "already_completed", dest: destName, detail: "this burn was already minted on " + dest.name }; await kvSetEx(cacheKey, JSON.stringify(done), 86400); res.status(200).json(done); return }
    res.status(500).json({ status: "sim_failed", dest: destName, detail: detail.slice(0, 300) }); return
  }

  let mintTx
  try { mintTx = await walletClient.writeContract(sim.request) } catch (e) { res.status(500).json({ status: "send_failed", dest: destName, detail: String((e && e.shortMessage) || (e && e.message) || e).slice(0, 300) }); return }

  let rcpt = null
  try { rcpt = await publicClient.waitForTransactionReceipt({ hash: mintTx, timeout: 45000 }) } catch {}
  if (!rcpt || rcpt.status !== "success") { res.status(500).json({ status: "tx_failed", dest: destName, mintTxHash: mintTx, detail: rcpt ? rcpt.status : "timeout" }); return }

  const result = { status: "success", dest: destName, mintTxHash: mintTx, explorer: dest.explorer + mintTx, signer: account.address, sourceBurnTx: txHash, honest_note: "Real CCTP mint via MessageTransmitterV2.receiveMessage on " + dest.name + "; USDC minted to the recipient encoded in the original Arc burn. Verify on the destination explorer." }
  await kvSetEx(cacheKey, JSON.stringify(result), 86400)
  res.status(200).json(result)
}
