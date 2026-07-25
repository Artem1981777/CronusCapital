#!/usr/bin/env node
// scripts/rhea-agent.mjs — "Rhea": autonomous buyer with price negotiation (m2m price discovery).
// Flow: quote -> reserve-price check -> budget check -> pay (Circle Gateway, gas-free) -> quality -> public ledger.
// HONEST LABEL: agent-to-agent demo between two wallets of the same project, clearly disclosed.
import { GatewayClient } from "@circle-fin/x402-batching/client"
import fs from "node:fs"
import path from "node:path"

const BASE = process.env.CRONUS_BASE || "https://cronus-capital.vercel.app"
const PK = process.env.RHEA_PRIVATE_KEY
const CHAIN = process.env.RHEA_CHAIN || "arcTestnet"
const DAILY_BUDGET = Number(process.env.RHEA_DAILY_BUDGET || "0.01")
const RESERVE_PRICE = Number(process.env.RHEA_RESERVE_PRICE || "0.002")
const TOPIC = process.env.RHEA_TOPIC || "BTC-USDC momentum"
const DRY = process.argv.includes("--dry-run")
const log = (...a) => console.log(...a)

function ledgerPath() {
  return path.join("m2m-ledger", new Date().toISOString().slice(0, 10) + ".json")
}
function appendLedger(entry) {
  fs.mkdirSync("m2m-ledger", { recursive: true })
  const p = ledgerPath()
  let arr = []
  try { arr = JSON.parse(fs.readFileSync(p, "utf8")) } catch (_) {}
  arr.push(entry)
  fs.writeFileSync(p, JSON.stringify(arr, null, 2))
  return p
}
function spentToday() {
  try {
    const arr = JSON.parse(fs.readFileSync(ledgerPath(), "utf8"))
    return Math.round(arr.filter(e => e.action === "BUY").reduce((s, e) => s + Number(e.paidUsd || 0), 0) * 1e6) / 1e6
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
