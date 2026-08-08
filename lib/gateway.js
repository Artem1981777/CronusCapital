// lib/gateway.js — Gateway settlement resolver (ADDITIVE, read-only).
// Honestly maps payments to on-chain settlements. No fabricated hashes:
// unavailable/batched mappings are returned as null/labeled.
//   - x402-exact:            direct USDC transfer payer -> treasury (1:1, verifiable on arcscan)
//   - circle-gateway-batched: real on-chain footprint of GatewayWallet (burn + settle via attestation)
//   - transferId lookup:     real Circle facilitator call when CIRCLE_GATEWAY_API_KEY is configured

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const USDC = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase()
const TREASURY = (process.env.CRONUS_PAYTO || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd").toLowerCase()
const GATEWAY_WALLET = (process.env.GATEWAY_WALLET || "0x0077777d7eba4688bdef3e311b846f25870a19b9").toLowerCase()
const FAC = process.env.GATEWAY_FACILITATOR_URL || "https://gateway-api-testnet.circle.com"
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const EXPLORER_TX = "https://testnet.arcscan.app/tx/"
const RANGE = 10000

// One request to this resolver costs ~18 calls to the public Arc node: two block-tip
// reads, six log windows each for the direct and the batched rail, and four receipt
// lookups for the anchored settlements. Nothing was reused, so two reviewers hitting
// the endpoint at once exhausted the public rate limit and every dependent check went
// red - twelve of them, which I twice misread as a fault in the treasury route.
// A short cache fixes the cause; the stale path below keeps a rate limit from turning
// a known-good answer into no answer.
const CACHE_KEY = "cronus:gateway:settlements"
const TTL_SECONDS = Number(process.env.SETTLEMENTS_CACHE_TTL || "300")
// Five minutes, matching the warm-cache workflow that runs every five minutes.
// A shorter window than the warmer means the key cools between runs and a visitor
// pays the 39s cold scan; a longer one would age the answer past what the warmer
// can justify. Settlements only ever get appended, and the real age is reported.
// Retained far past freshness on purpose: after TTL it is no longer served as current,
// only as an explicitly aged fallback.
const STALE_MAX_SECONDS = Number(process.env.SETTLEMENTS_STALE_MAX || "86400")

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

// The node refusing to answer must not erase what it already told us. Serve the last
// successful resolution with its real age, stated plainly, and return false when there
// is nothing stored so the caller refuses instead of inventing settlements.
async function serveStale(res, key, why) {
  const last = await kvCmd(["GET", key])
  if (!last) return false
  try {
    const obj = typeof last === "string" ? JSON.parse(last) : last
    if (!obj || !obj.body) return false
    const age = Math.round((Date.now() - Number(obj.cachedAt || 0)) / 1000)
    res.status(200).json({
      ...obj.body,
      cache: { hit: true, stale: true, ageSeconds: age, ttlSeconds: TTL_SECONDS,
        note: "Arc could not be read for this request. This is the last successful resolution, " + age + "s old; no hash, count or total was recomputed." },
      degraded: { reason: "arc_rpc_unavailable", detail: String((why && why.message) || why || "") },
    })
    return true
  } catch (_) { return false }
}
// Real, on-chain-confirmed direct x402 settlements (payer -> treasury), corroborated by
// direct tx-hash lookup so they never age out of the rolling log-scan window. Verified
// live via eth_getTransactionReceipt; never fabricated. Env-overridable (comma-separated).
const ANCHOR_TXS = (process.env.DIRECT_SETTLEMENT_ANCHORS || "0xc237ce090f8291dff596e185f1ebbcea755a282567c6fcb080fd183640ad9588,0xa7a0e3b25394d2c0570be62605f0a379b1a0e5d1ba2e7607f719fbd1ca9943d5,0xfe2764b2b837365ea7cb896fbbe55119ffbf250e51941945bf013a88bb942086,0x20dde9798102943bac96cf756957ab716390f611866f3f9e91db93d907b971b6").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)

const pad = (a) => "0x000000000000000000000000" + a.toLowerCase().replace(/^0x/, "")
const hx = (n) => "0x" + n.toString(16)
const isZero = (a) => /^0x0+$/.test(a)
const topicAddr = (t) => ("0x" + String(t).slice(26)).toLowerCase()

async function rpcOnce(method, params) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })
  const j = await r.json()
  if (j.error) throw new Error(method + ": " + JSON.stringify(j.error))
  return j.result
}

// The public Arc node answers -32011 request limit reached under load. That is a
// "come back shortly", not a fact about the chain, so it is retried with backoff.
// A revert or a malformed request is a real answer and is surfaced immediately.
async function rpc(method, params) {
  let last
  for (let i = 0; i < 3; i++) {
    try { return await rpcOnce(method, params) }
    catch (e) {
      last = e
      const m = String((e && e.message) || e)
      if (!/32011|request limit|rate|timeout|fetch failed|ECONN|502|503|504/i.test(m)) throw e
      await new Promise((r) => setTimeout(r, 400 + i * 600))
    }
  }
  throw last
}

// Fifty log queries fired at once trip the node's limit; fifty issued one after the
// other took 80s locally, past the platform's function ceiling. Neither is a real
// choice, so windows are fetched a few at a time: independent, so order is irrelevant,
// and bounded, so the node is never asked for more than it will give.
const SCAN_CONCURRENCY = Number(process.env.SETTLEMENTS_SCAN_CONCURRENCY || "5")

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

async function scan(topics, windows, tip) {
  // The caller may pass a block tip it already read: two rails scanning the same
  // chain should not ask twice where the chain ends.
  const latest = Number.isFinite(tip) ? tip : parseInt(await rpc("eth_blockNumber", []), 16)
  const out = []
  const ranges = []
  for (let i = 0; i < windows; i++) {
    const to = latest - i * RANGE
    if (to < 0) break
    ranges.push({ to, fr: Math.max(0, to - (RANGE - 1)) })
  }
  const batches = await mapPool(ranges, SCAN_CONCURRENCY, async (r) => {
    try { return await rpc("eth_getLogs", [{ address: USDC, topics, fromBlock: hx(r.fr), toBlock: hx(r.to) }]) }
    catch (e) { return null }
  })
  for (const logs of batches) {
    if (Array.isArray(logs)) for (const l of logs) out.push({
      txHash: l.transactionHash,
      block: parseInt(l.blockNumber, 16),
      from: "0x" + l.topics[1].slice(26),
      to: "0x" + l.topics[2].slice(26),
      amountUsdc: parseInt(l.data, 16) / 1e6,
    })
  }
  return { latest, logs: out, windowsRequested: ranges.length, windowsFailed: batches.filter((b) => !Array.isArray(b)).length }
}

// Corroborate known real direct settlements by tx hash (immune to window aging).
async function resolveAnchorSettlements() {
  const out = []
  for (const h of ANCHOR_TXS) {
    let rec
    for (let att = 0; att < 3 && !rec; att++) { try { rec = await rpc("eth_getTransactionReceipt", [h]) } catch (e) { await new Promise((r2) => setTimeout(r2, 350 * (att + 1))) } }
    if (!rec || rec.status !== "0x1" || !Array.isArray(rec.logs)) continue
    for (const l of rec.logs) {
      if (String(l.address || "").toLowerCase() !== USDC) continue
      if (!l.topics || String(l.topics[0] || "").toLowerCase() !== TRANSFER_TOPIC) continue
      if (l.topics.length < 3) continue
      if (topicAddr(l.topics[2]) !== TREASURY) continue
      const from = topicAddr(l.topics[1])
      if (from === GATEWAY_WALLET || from === TREASURY) continue
      out.push({ txHash: String(l.transactionHash || h), block: parseInt(rec.blockNumber, 16), payer: from, amountUsdc: parseInt(l.data, 16) / 1e6, rail: "x402-exact", explorer: EXPLORER_TX + String(l.transactionHash || h), anchored: true })
    }
  }
  return out
}

export async function resolveDirectSettlements(windows, tip) {
  let anchorsPre = []
  try { anchorsPre = await resolveAnchorSettlements() } catch (e) { anchorsPre = [] }
  const { latest, logs, windowsRequested, windowsFailed } = await scan([TRANSFER_TOPIC, null, pad(TREASURY)], windows, tip)
  const scanned = logs
    .filter((l) => l.from.toLowerCase() !== GATEWAY_WALLET && l.from.toLowerCase() !== TREASURY)
    .map((l) => ({ txHash: l.txHash, block: l.block, payer: l.from, amountUsdc: l.amountUsdc, rail: "x402-exact", explorer: EXPLORER_TX + l.txHash }))
  let anchors = []
  anchors = anchorsPre
  const seen = new Set()
  const settlements = []
  for (const s of scanned.concat(anchors)) {
    const k = String(s.txHash).toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    settlements.push(s)
  }
  settlements.sort((a, b) => b.block - a.block)
  return {
    rail: "x402-exact",
    mapping: "1:1-onchain",
    chainTip: latest,
    windowBlocks: windows * RANGE,
    count: settlements.length,
		scan: { windowsRequested, windowsFailed, complete: windowsFailed === 0 },
    totalUsdc: Number(settlements.reduce((s, x) => s + x.amountUsdc, 0).toFixed(6)),
    settlements: settlements.slice(0, 50),
  }
}

export async function resolveGatewayFootprint(windows, tip) {
  const { latest, logs, windowsRequested, windowsFailed } = await scan([TRANSFER_TOPIC, pad(GATEWAY_WALLET)], windows, tip)
  const burns = logs.filter((l) => isZero(l.to))
  const settles = logs.filter((l) => !isZero(l.to))
  const recip = {}
  for (const l of settles) recip[l.to] = (recip[l.to] || 0) + 1
  return {
    rail: "circle-gateway-batched",
    mapping: "net-batched",
    note: "Real on-chain footprint of Circle Gateway settlement from the GatewayWallet (burn + mint via attestation). A single nano-payment UUID does NOT map 1:1 to one on-chain tx on Arc testnet: Gateway nets positions and settles in batches. Per-transfer facilitator status requires Circle API credentials (see transferLookup).",
    chainTip: latest,
    windowBlocks: windows * RANGE,
    gatewayWallet: GATEWAY_WALLET,
    onchainSettleTransfers: settles.length,
		scan: { windowsRequested, windowsFailed, complete: windowsFailed === 0 },
    onchainBurns: burns.length,
    topRecipients: Object.entries(recip).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([addr, n]) => ({ addr, count: n })),
    samples: settles.slice(0, 5).map((l) => ({ txHash: l.txHash, to: l.to, amountUsdc: l.amountUsdc, explorer: EXPLORER_TX + l.txHash })),
  }
}

export async function resolveTransferById(id) {
  const url = FAC.replace(/\/$/, "") + "/v1/x402/transfers/" + encodeURIComponent(id)
  const key = process.env.CIRCLE_GATEWAY_API_KEY || process.env.CIRCLE_API_KEY
  if (!key) return { resolved: false, id, lookupUrl: url, reason: "facilitator auth not configured; per-transfer Gateway status requires Circle API credentials" }
  try {
    const r = await fetch(url, { headers: { authorization: "Bearer " + key } })
    const body = await r.json().catch(() => null)
    return { resolved: r.ok, id, status: r.status, transfer: r.ok ? body : null, error: r.ok ? null : body }
  } catch (e) {
    return { resolved: false, id, lookupUrl: url, error: String((e && e.message) || e) }
  }
}

export async function resolveSettlements(opts) {
  const windows = Math.min(Math.max(parseInt((opts && opts.windows) || 6, 10) || 6, 1), 24)
  // At windows=24 the two rails together issue about fifty log queries. Fired at once
  // they tripped the public node's limit and the whole resolver answered 500 - the
  // block-tip read is the one call outside scan's per-window try, so it took
  // everything down with it. One shared tip, and the rails walk the chain in turn.
  const tip = parseInt(await rpc("eth_blockNumber", []), 16)
  const direct = await resolveDirectSettlements(windows, tip)
  const gateway = await resolveGatewayFootprint(windows, tip)
  const out = {
    ok: true,
    resolver: "cronus-gateway-settlement",
    generatedAt: new Date().toISOString(),
    treasury: TREASURY,
    usdc: USDC,
    rails: { directOnchain: direct, gatewayBatched: gateway },
		scanComplete: !!(direct.scan && direct.scan.complete) && !!(gateway.scan && gateway.scan.complete),
    honesty: "On-chain settlements are real and verifiable on arcscan; no hash is fabricated. Batched/unavailable mappings are labeled and null. External vs self-generated payers are reported by /api/traction.",
  }
  if (!out.scanComplete) out.degraded = { reason: "partial_log_scan", detail: "One or more log windows could not be read on this request, so counts and totals are a floor, not a complete tally." }
	if (opts && opts.transferId) out.transferLookup = await resolveTransferById(opts.transferId)
  return out
}

// Default export: Vercel-style (req,res) handler. Routed via /api/info?kind=settlements.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  try {
    const q = (req && req.query) || {}
    const windows = Math.min(Math.max(parseInt(q.windows || 6, 10) || 6, 1), 24)
    const key = CACHE_KEY + ":" + windows
    const fresh = String(q.fresh || "") === "1"
    // A per-transfer lookup names one id and is never answered from a shared cache.
    if (!q.transferId && !fresh) {
      const hit = await kvCmd(["GET", key])
      if (hit) {
        try {
          const obj = typeof hit === "string" ? JSON.parse(hit) : hit
          const age = Math.round((Date.now() - Number(obj.cachedAt || 0)) / 1000)
          if (obj && obj.body && age <= TTL_SECONDS) {
            return res.status(200).json({ ...obj.body, cache: { hit: true, stale: false, ageSeconds: age, ttlSeconds: TTL_SECONDS,
              note: "resolved from Arc " + age + "s ago; settlements are append-only, so a short reuse window cannot hide one. Add ?fresh=1 to re-scan now." } })
          }
        } catch (_) {}
      }
    }
    try {
      const out = await resolveSettlements({ windows, transferId: q.transferId })
      if (!q.transferId && out.scanComplete) await kvCmd(["SET", key, JSON.stringify({ cachedAt: Date.now(), body: out }), "EX", String(STALE_MAX_SECONDS)])
			if (!out.scanComplete && !fresh && await serveStale(res, key, new Error("partial log scan: refusing to serve an incomplete tally as current"))) return
      return res.status(200).json({ ...out, cache: { hit: false, stale: false, ageSeconds: 0, ttlSeconds: TTL_SECONDS, note: "scanned live on Arc for this request" } })
    } catch (inner) {
      if (await serveStale(res, key, inner)) return
      throw inner
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) })
  }
}
