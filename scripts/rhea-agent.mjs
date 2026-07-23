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
    return arr.filter(e => e.action === "BUY").reduce((s, e) => s + Number(e.paidUsd || 0), 0)
  } catch (_) { return 0 }
}
const parseUsd = (s) => Number(String(s || "").replace("$", "")) || 0

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
  log("[OK] m2m trade recorded -> " + appendLedger(entry))
}

main().catch((e) => { console.error("[rhea] FAILED:", e.message || e); process.exit(1) })
