#!/usr/bin/env node
// scripts/buyer-agent.mjs — autonomous A2A buyer for Cronus Capital.
// Discovers the NANO (Circle Gateway) service from /api/manifest, enforces a budget,
// pays gas-free via Circle Gateway (EIP-3009), and consumes the signal.
// HONEST LABEL: this is an autonomous agent-to-agent demo, NOT organic 3rd-party demand.
import { GatewayClient } from "@circle-fin/x402-batching/client"

function arg(name, def) {
  const i = process.argv.indexOf("--" + name)
  if (i >= 0) { const v = process.argv[i + 1]; return (v && !v.startsWith("--")) ? v : true }
  return def
}
const has = (name) => process.argv.includes("--" + name)

const MANIFEST = String(arg("manifest", process.env.CRONUS_MANIFEST || "https://cronus-capital.vercel.app/api/manifest"))
const MAX_USD  = Number(arg("max-usd", process.env.BUYER_MAX_USD || "0.01"))
const TOPIC    = String(arg("topic", "BTC-USDC momentum"))
const CHAIN    = String(arg("chain", "arcTestnet"))
const DEPOSIT  = arg("deposit", null)
const DRY      = has("dry-run")
const PK       = process.env.BUYER_PRIVATE_KEY

const log  = (...a) => console.log(...a)
const step = (n, t) => log("\n[" + n + "] " + t)

async function main() {
  step(1, "Discover service from manifest")
  log("    manifest:", MANIFEST)
  const mr = await fetch(MANIFEST)
  if (!mr.ok) throw new Error("manifest fetch failed: HTTP " + mr.status)
  const manifest = await mr.json()
  const services = manifest.services || []
  const svc = services.find((s) => s.settlement === "circle-gateway-batched") || services.find((s) => s.tier === "NANO")
  if (!svc) throw new Error("no Circle Gateway (NANO) service advertised in manifest")
  const resource = svc.resource
  const amountAtomic = String((svc.price && svc.price.amount) || "0")
  const priceUsd = Number(amountAtomic) / 1e6
  log("    found:", svc.tier, resource)
  log("    price:", priceUsd, "USDC | payTo:", svc.payTo, "| network:", svc.network)

  step(2, "Budget guard")
  log("    max allowed:", MAX_USD, "USDC | call price:", priceUsd, "USDC")
  if (priceUsd > MAX_USD) { log("    ABORT: price exceeds budget. Not paying."); process.exit(2) }
  log("    OK: within budget.")

  if (DRY) {
    step(3, "Dry-run — discovery + budget passed; skipping payment.")
    log("    would pay", priceUsd, "USDC (gas-free) to", svc.payTo, "then GET", resource)
    return
  }

  if (!PK) throw new Error("BUYER_PRIVATE_KEY env required for live payment (or pass --dry-run)")

  step(3, "Init Gateway buyer client")
  const gateway = new GatewayClient({ chain: CHAIN, privateKey: PK.startsWith("0x") ? PK : "0x" + PK })
  log("    agent address:", gateway.address, "| chain:", CHAIN)

  step(4, "Check balances")
  let balances
  try {
    balances = await gateway.getBalances()
    log("    wallet USDC:", balances.wallet.formatted)
    log("    gateway USDC (available):", balances.gateway.formattedAvailable)
  } catch (e) { log("    (balance check failed: " + (e.message || e) + ")") }

  if (DEPOSIT && DEPOSIT !== true) {
    step("4b", "Deposit into Gateway Wallet: " + DEPOSIT + " USDC")
    const dr = await gateway.deposit(String(DEPOSIT))
    log("    deposit tx:", dr.depositTxHash)
    balances = await gateway.getBalances().catch(() => balances)
    if (balances) log("    gateway USDC now:", balances.gateway.formattedAvailable)
  }

  if (balances && Number(balances.gateway.formattedAvailable) < priceUsd) {
    log("\n[!] Insufficient Circle Gateway balance.")
    log("    One-time deposit required before gas-free nano payments:")
    log("      node scripts/buyer-agent.mjs --deposit 1")
    log("      (or Circle CLI: circle gateway deposit --chain ARC-TESTNET --amount 1)")
    process.exit(3)
  }

  step(5, "Pay (gas-free EIP-3009 via Circle Gateway) and consume")
  const url = resource + "?topic=" + encodeURIComponent(TOPIC)
  const result = await gateway.pay(url)
  const data = result.data || {}
  log("    settled. amount:", result.formattedAmount, "USDC")
  log("    settlement tx:", result.transaction || "(batched/pending)")
  if (result.transaction) log("    explorer: https://testnet.arcscan.app/tx/" + result.transaction)

  step(6, "Consumed signal (A2A)")
  const rep = data.report || {}
  log("    verdict:", rep.verdict, "| conviction:", rep.conviction)
  if (data.payment) log("    seller-reported settlement:", data.payment.settlement, data.payment.explorer || "")

  step("OK", "Autonomous A2A purchase complete (honest label: agent-to-agent demo).")
  log("    // TODO P6b: write ERC-8004 reputation feedback for the seller agent after a successful job.")
}

main().catch((e) => { console.error("\n[buyer-agent] FAILED:", e.message || e); process.exit(1) })
