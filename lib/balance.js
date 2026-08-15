// lib/balance.js — read-only treasury balances on Arc (USDC token + native gas).
const USDC = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase()
const PAY_TO = (process.env.CRONUS_PAYTO || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd").toLowerCase()
const RPC = process.env.VITE_RPC_URL || process.env.SIGNAL_RPC_URL || process.env.ARC_RPC || process.env.RPC_URL || "https://rpc.testnet.arc.network"
async function rpc(method, params) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })
  const j = await r.json()
  if (j && j.error) throw new Error((j.error && j.error.message) || "rpc error")
  return j && j.result
}
function hexToBig(h) { try { return BigInt(h || "0x0") } catch { return 0n } }
function pad(a) { return String(a).replace(/^0x/, "").toLowerCase().padStart(64, "0") }
export default async function balance(req, res) {
  const address = PAY_TO
  let usdcAtomic = 0n, nativeWei = 0n, usdcErr = null, nativeErr = null
  try { const out = await rpc("eth_call", [{ to: USDC, data: "0x70a08231" + pad(address) }, "latest"]); usdcAtomic = hexToBig(out) } catch (e) { usdcErr = String((e && e.message) || e).slice(0, 120) }
  try { const nb = await rpc("eth_getBalance", [address, "latest"]); nativeWei = hexToBig(nb) } catch (e) { nativeErr = String((e && e.message) || e).slice(0, 120) }
  let last_payout_at = null
  try {
    const base = ((req.headers && req.headers["x-forwarded-proto"]) || "https") + "://" + ((req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "cronus-capital.vercel.app")
    const pr = await fetch(base + "/api/agent-payout?action=status"); const pj = await pr.json()
    const led = (pj && pj.ledger) || []; const lp = led.find(x => x && x.action === "payout")
    last_payout_at = (lp && lp.at) || (led[0] && led[0].at) || null
  } catch (e) {}
  res.status(200).json({ ok: true, network: "arc-testnet", address, usdc_balance: Number(usdcAtomic) / 1e6, usdc_atomic: usdcAtomic.toString(), arc_balance: Number(nativeWei) / 1e18, arc_wei: nativeWei.toString(), last_payout_at, usdc_source: usdcErr ? ("error: " + usdcErr) : "eth_call balanceOf(" + USDC + ")", native_source: nativeErr ? ("error: " + nativeErr) : "eth_getBalance", updatedAt: new Date().toISOString() })
}
