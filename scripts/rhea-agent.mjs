#!/usr/bin/env node
// scripts/rhea-agent.mjs — "Rhea": autonomous buyer with price negotiation (m2m price discovery).
// Flow: quote -> reserve-price check -> budget check -> pay (Circle Gateway, gas-free) -> quality -> public ledger.
// HONEST LABEL: agent-to-agent demo between two wallets of the same project, clearly disclosed.
import { GatewayClient } from "@circle-fin/x402-batching/client"
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

const BASE = process.env.CRONUS_BASE || "https://cronus-capital.vercel.app"
const PK = process.env.RHEA_PRIVATE_KEY
const CHAIN = process.env.RHEA_CHAIN || "arcTestnet"
const DAILY_BUDGET = Number(process.env.RHEA_DAILY_BUDGET || "0.01")
const RESERVE_PRICE = Number(process.env.RHEA_RESERVE_PRICE || "0.002")
// bandit: Rhea allocates her budget across topics using her own market-graded history (epsilon-greedy).
// Rewards come from track-record.json (HIT/MISS judged by real price moves), not from self-review.
const TOPICS = ["BTC-USDC momentum", "ETH-USDC trend", "SOL-USDC breakout"]
const EPSILON = Number(process.env.RHEA_BANDIT_EPSILON || "0.2")
function banditStats() {
  const stats = {}
  for (const t of TOPICS) stats[t] = { tries: 0, reward: 0 }
  try {
    const tr = JSON.parse(fs.readFileSync(path.join("m2m-ledger", "track-record.json"), "utf8"))
    for (const r of tr.records || []) {
      if (!stats[r.topic]) continue
      if (r.result === "GRADED") { stats[r.topic].tries += 1; stats[r.topic].reward += r.hit ? 1 : 0 }
      if (r.result === "ABSTAIN") { stats[r.topic].tries += 0.5; stats[r.topic].reward += 0.25 }
    }
  } catch (_) {}
  try {
    for (const f of fs.readdirSync("m2m-ledger").filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
      let arr = []
      try { arr = JSON.parse(fs.readFileSync(path.join("m2m-ledger", f), "utf8")) } catch (_) { continue }
      for (const e of arr) {
        if (e.action === "BUY" && e.quality && stats[e.topic]) { stats[e.topic].tries += 0.25; stats[e.topic].reward += e.quality.delivered ? 0.125 : 0 }
      }
    }
  } catch (_) {}
  return stats
}
function chooseTopic() {
  if (process.env.RHEA_TOPIC) return { topic: process.env.RHEA_TOPIC, mode: "env-override" }
  const stats = banditStats()
  const untried = TOPICS.filter((t) => stats[t].tries === 0)
  if (untried.length) return { topic: untried[0], mode: "explore-untried", stats }
  if (Math.random() < EPSILON) return { topic: TOPICS[Math.floor(Math.random() * TOPICS.length)], mode: "explore", stats }
  let best = TOPICS[0], bestAvg = -1
  for (const t of TOPICS) { const a = stats[t].reward / stats[t].tries; if (a > bestAvg) { bestAvg = a; best = t } }
  return { topic: best, mode: "exploit", avg: Math.round(bestAvg * 100) / 100, stats }
}
const _pick = chooseTopic()
const TOPIC = _pick.topic
const DRY = process.argv.includes("--dry-run")
const log = (...a) => console.log(...a)

function ledgerPath() {
  return path.join("m2m-ledger", new Date().toISOString().slice(0, 10) + ".json")
}
// --- hash chain: every ledger entry pins the sha256 of the previous one; history cannot be quietly rewritten ---
function entryHash(e) { return "sha256:" + crypto.createHash("sha256").update(JSON.stringify(e)).digest("hex") }
function lastChainHash() {
  try {
    const files = fs.readdirSync("m2m-ledger").filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    for (let i = files.length - 1; i >= 0; i--) {
      try {
        const arr = JSON.parse(fs.readFileSync(path.join("m2m-ledger", files[i]), "utf8"))
        if (arr.length) return entryHash(arr[arr.length - 1])
      } catch (_) {}
    }
  } catch (_) {}
  return "sha256:genesis"
}
function appendLedger(entry) {
  fs.mkdirSync("m2m-ledger", { recursive: true })
  const p = ledgerPath()
  let arr = []
  try { arr = JSON.parse(fs.readFileSync(p, "utf8")) } catch (_) {}
  entry.chain = { standard: "cronus-hashchain-v1", prev: lastChainHash() }
  arr.push(entry)
  fs.writeFileSync(p, JSON.stringify(arr, null, 2))
  return p
}
function spentToday() {
  try {
    const arr = JSON.parse(fs.readFileSync(ledgerPath(), "utf8"))
    return Math.round(arr.filter(e => e.action === "BUY" || e.action === "REPAY").reduce((s, e) => s + Number(e.paidUsd || 0), 0) * 1e6) / 1e6
  } catch (_) { return 0 }
}
const parseUsd = (s) => Number(String(s || "").replace("$", "")) || 0

// [5] reputation loop: after a settled trade, Rhea rates the seller on-chain (ERC-8004 reputation).
const REPUTATION_REGISTRY = process.env.REPUTATION_REGISTRY || "0x2A19ad056EaE83364B0a6420685974cA219c209E"
const SELLER_AGENT_ID = Number(process.env.SELLER_AGENT_ID || "1")
const ARC_RPC_URL = process.env.ARC_RPC || ("https:" + "//rpc.blockdaemon.testnet.arc.network")
async function leaveFeedback(settlement, quality) {
  const { createWalletClient, createPublicClient, http, defineChain, keccak256, stringToHex } = await import("viem")
  const { privateKeyToAccount } = await import("viem/accounts")
  const chain = defineChain({ id: 5042002, name: "arc-testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [ARC_RPC_URL] } } })
  const account = privateKeyToAccount(PK.startsWith("0x") ? PK : "0x" + PK)
  const wallet = createWalletClient({ account: account, chain: chain, transport: http(ARC_RPC_URL) })
  const pub = createPublicClient({ chain: chain, transport: http(ARC_RPC_URL) })
  const abi = [{ type: "function", name: "giveFeedback", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "uint8" }, { type: "bytes32" }, { type: "string" }], outputs: [{ type: "uint256" }] }]
  const score = quality && quality.delivered ? 5 : 2
  const jobRef = keccak256(stringToHex("m2m:" + String(settlement)))
  const uri = "https:" + "//github.com/Artem1981777/CronusCapital/blob/main/" + ledgerPath()
  const hash = await wallet.writeContract({ address: REPUTATION_REGISTRY, abi: abi, functionName: "giveFeedback", args: [BigInt(SELLER_AGENT_ID), score, jobRef, uri] })
  await pub.waitForTransactionReceipt({ hash: hash })
  return { standard: "ERC-8004", agentId: SELLER_AGENT_ID, score: score, jobRef: jobRef, tx: hash }
}

async function main() {
  const entry = { agent: "rhea", ts: new Date().toISOString(), topic: TOPIC }
  entry.bandit = { mode: _pick.mode, epsilon: EPSILON }
  log("[0] bandit topic selection: " + TOPIC + " (" + _pick.mode + ")")
  let gateway = null, address = null
  if (PK) { gateway = new GatewayClient({ chain: CHAIN, privateKey: PK.startsWith("0x") ? PK : "0x" + PK, ...(process.env.ARC_RPC ? { rpcUrl: process.env.ARC_RPC } : {}) }); address = gateway.address }

  log("[1] requesting personalized quote" + (address ? " as " + address : " (anonymous)"))
  const qr = await fetch(BASE + "/api/nano-signal?quote=1" + (address ? "&payer=" + address : ""))
  if (!qr.ok) throw new Error("quote failed: HTTP " + qr.status)
  const quote = await qr.json()
  const offeredUsd = parseUsd(quote.offered && quote.offered.price)
  entry.quote = quote.offered; entry.purchases = quote.purchases; entry.loyal = !!quote.loyal
  log("    prices: " + JSON.stringify(quote.prices))
  log("    offered: " + (quote.offered && quote.offered.price) + " | purchases: " + quote.purchases + " | loyal: " + quote.loyal)
  if (gateway && quote.credit && Number(quote.credit.unitsOutstanding) > 0) {
    try {
      log("[1b] repaying trade credit: " + quote.credit.unitsOutstanding + " unit(s) outstanding")
      const rr = await gateway.pay(BASE + "/api/nano-signal?repay=1&payer=" + address)
      const rd = (rr && rr.data) || {}
      appendLedger({ agent: "rhea", ts: new Date().toISOString(), action: "REPAY", paidUsd: Number(rr.formattedAmount || 0), settlement: rr.transaction || "(batched)", creditStatus: rd.creditStatus || null })
      log("  repaid 1 unit | tx: " + (rr.transaction || "(batched)"))
    } catch (e) { log("  repay failed (non-fatal): " + (e.message || e)) }
  }
  if (quote.convictionPricing) { entry.convictionPricing = quote.convictionPricing; log("  conviction-pegged: band " + quote.convictionPricing.band + " | oracle confidence " + quote.convictionPricing.conviction) }
  if (gateway && quote.stake && Number(quote.stake.owedMakeGoods) > 0) {
    try {
      log("[1c] conviction stake: seller owes " + quote.stake.owedMakeGoods + " make-good unit(s) for market-graded misses")
      let missKeys = []
      try {
        const trj = JSON.parse(fs.readFileSync(path.join("m2m-ledger", "track-record.json"), "utf8"))
        missKeys = (trj.records || []).filter((r) => r.result === "GRADED" && r.hit === false).map((r) => r.key).reverse()
      } catch (_) {}
      for (const mk of missKeys.slice(0, 3)) {
        const mr = await fetch(BASE + "/api/nano-signal?makegood=" + encodeURIComponent(mk) + "&topic=" + encodeURIComponent(TOPIC) + "&payer=" + address)
        const mj = await mr.json()
        if (mr.ok && mj && mj.makeGood) {
          appendLedger({ agent: "rhea", ts: new Date().toISOString(), action: "MAKE_GOOD", topic: TOPIC, key: mk, paidUsd: 0, quality: { delivered: !!(mj.report && mj.report.verdict), verdict: (mj.report && mj.report.verdict) || null, conviction: mj.report && mj.report.conviction != null ? mj.report.conviction : null } })
          log("  make-good redeemed for miss " + mk + " (free unit, stake slashed)")
          break
        }
        if (mr.status !== 409) { log("  make-good refused: HTTP " + mr.status); break }
      }
    } catch (e) { log("  make-good attempt failed (non-fatal): " + (e.message || e)) }
  }
  if (gateway && quote.convictionPricing && quote.convictionPricing.band === "premium" && quote.convictionPricing.bands) {
    try {
      const target = quote.convictionPricing.bands.standard
      log("[2a] haggling: premium band offered, countering at " + target)
      const cr = await fetch(BASE + "/api/nano-signal?quote=1&counter=" + encodeURIComponent(target) + "&payer=" + address)
      const cj = await cr.json()
      if (cj && cj.accepted) { entry.negotiation = { countered: quote.offered && quote.offered.price, agreed: cj.price, band: cj.band }; log("  counteroffer ACCEPTED: " + cj.price + " (" + cj.band + ")") }
      else { entry.negotiation = { countered: quote.offered && quote.offered.price, agreed: null, reason: (cj && cj.reason) || null }; log("  counteroffer rejected: " + ((cj && cj.reason) || "-")) }
    } catch (e) { log("  haggling failed (non-fatal): " + (e.message || e)) }
  }

  // trust gate: reputation is not decoration - Rhea refuses to buy from a badly rated seller
  const MIN_SELLER_AVG = Number(process.env.RHEA_MIN_SELLER_AVG || "4")
  const rep8004 = quote.sellerReputation || null
  if (rep8004 && rep8004.feedbacks > 0 && rep8004.avg !== null && rep8004.avg < MIN_SELLER_AVG) {
    const dentry = { agent: "rhea", ts: new Date().toISOString(), action: "DISTRUST", reason: "seller rated " + rep8004.avg + "/5 over " + rep8004.feedbacks + " on-chain feedbacks, below threshold " + MIN_SELLER_AVG, sellerReputation: rep8004 }
    log("  DISTRUST: " + dentry.reason)
    log("  ledger: " + appendLedger(dentry))
    return
  }
  log("  seller reputation: " + (rep8004 && rep8004.feedbacks ? rep8004.avg + "/5 over " + rep8004.feedbacks + " feedbacks" : "none yet") + " | trust threshold: " + MIN_SELLER_AVG + "/5")

  const spent = spentToday()
  const remaining = Math.max(0, DAILY_BUDGET - spent)
  log("[2] negotiate: reserve " + RESERVE_PRICE + " | daily budget " + DAILY_BUDGET + " | spent " + spent.toFixed(6) + " | left " + remaining.toFixed(6))
  if (offeredUsd > RESERVE_PRICE) {
    entry.action = "WALK_AWAY"; entry.reason = "offered " + offeredUsd + " above reserve " + RESERVE_PRICE
    log("    WALK AWAY: " + entry.reason); log("    ledger: " + appendLedger(entry)); return
  }
  if (offeredUsd > remaining) {
    if (gateway && quote.credit && quote.credit.eligible) {
      try {
        log("  budget exhausted -> trying trade credit (buy now, repay next run)")
        const cres = await fetch(BASE + "/api/nano-signal?credit=1&topic=" + encodeURIComponent(TOPIC) + "&payer=" + address)
        if (cres.ok) {
          const cd = await cres.json()
          entry.action = "BUY_ON_CREDIT"
          entry.credit = cd.creditStatus || null
          const crep = cd.report || {}
          entry.quality = { delivered: !!(crep.verdict && crep.conviction != null), verdict: crep.verdict || null, conviction: crep.conviction == null ? null : crep.conviction }
          log("  BUY_ON_CREDIT | units outstanding: " + (cd.creditStatus ? cd.creditStatus.unitsOutstanding : "?"))
          log("  ledger: " + appendLedger(entry)); return
        }
        log("  credit refused: HTTP " + cres.status)
      } catch (e) { log("  credit attempt failed: " + (e.message || e)) }
    }
    entry.action = "DEFER"; entry.reason = "daily budget exhausted"
    log("    DEFER: " + entry.reason); log("    ledger: " + appendLedger(entry)); return
  }
  if (DRY || !gateway) {
    entry.action = "DRY_RUN"
    log("    dry-run: would buy at " + offeredUsd + " USDC"); log("    ledger: " + appendLedger(entry)); return
  }

  log("[3] accepting offer — paying " + offeredUsd + " USDC (gas-free via Circle Gateway)")
  const result = await gateway.pay(BASE + "/api/nano-signal?topic=" + encodeURIComponent(TOPIC) + "&payer=" + address)
  const data = result.data || {}
  entry.action = "BUY"
  entry.paidUsd = Number(result.formattedAmount || offeredUsd)
  entry.settlement = result.transaction || "(batched)"
  log("    settled: " + entry.paidUsd + " USDC | tx: " + entry.settlement)

  const rep = data.report || {}
  const delivered = !!(rep.verdict && rep.conviction != null)
  entry.quality = { delivered, verdict: rep.verdict || null, conviction: rep.conviction == null ? null : rep.conviction }
  log("[4] quality: delivered=" + delivered + " | verdict=" + (rep.verdict || "-"))
  const dr = data.deliveryReceipt || null
  if (dr && dr.payload && dr.signature) {
    try {
      const { recoverMessageAddress, keccak256, stringToHex } = await import("viem")
      const signer = await recoverMessageAddress({ message: JSON.stringify(dr.payload), signature: dr.signature })
      const hashOk = dr.payload.reportHash === keccak256(stringToHex(JSON.stringify(rep)))
      const signerOk = signer.toLowerCase() === String(dr.payload.signer || "").toLowerCase()
      entry.receipt = { standard: "EIP-191", verified: hashOk && signerOk, signer: signer, settlement: dr.payload.settlement, reportHash: dr.payload.reportHash, signature: dr.signature }
      log("[4b] delivery receipt: signature " + (signerOk ? "valid" : "INVALID") + " | report hash " + (hashOk ? "match" : "MISMATCH") + " | signer " + signer)
    } catch (e) {
      entry.receipt = { error: String((e && e.message) || e).slice(0, 120) }
      log("[4b] receipt verification failed (non-fatal): " + entry.receipt.error)
    }
  } else { log("[4b] no delivery receipt in response") }
  try {
    log("[5] reputation: rating the seller on-chain (ERC-8004 giveFeedback)")
    entry.feedback = await leaveFeedback(entry.settlement, entry.quality)
    log("    feedback tx: " + entry.feedback.tx + " | score " + entry.feedback.score + "/5")
  } catch (e) {
    entry.feedback = { error: String((e && e.message) || e).slice(0, 200) }
    log("    feedback failed (non-fatal): " + entry.feedback.error)
  }
  log("[OK] m2m trade recorded -> " + appendLedger(entry))
}

main().catch((e) => { console.error("[rhea] FAILED:", e.message || e); process.exit(1) })
