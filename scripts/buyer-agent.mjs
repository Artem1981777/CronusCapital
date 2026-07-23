#!/usr/bin/env node
// scripts/buyer-agent.mjs — autonomous A2A buyer for Cronus Capital.
// Discovers the NANO (Circle Gateway) service from /api/manifest, enforces a budget,
// pays gas-free via Circle Gateway (EIP-3009), and consumes the signal.
// HONEST LABEL: this is an autonomous agent-to-agent demo, NOT organic 3rd-party demand.
import { GatewayClient } from "@circle-fin/x402-batching/client"
import { ethers } from "ethers"

function arg(name, def) {
  const i = process.argv.indexOf("--" + name)
  if (i >= 0) { const v = process.argv[i + 1]; return (v && !v.startsWith("--")) ? v : true }
  return def
}
const has = (name) => process.argv.includes("--" + name)
const isOnchainTx = (t) => /^0x[0-9a-fA-F]{64}$/.test(String(t || ""))

const MANIFEST = String(arg("manifest", process.env.CRONUS_MANIFEST || "https://cronus-capital.vercel.app/api/manifest"))
const MAX_USD  = Number(arg("max-usd", process.env.BUYER_MAX_USD || "0.01"))
const TOPIC    = String(arg("topic", "BTC-USDC momentum"))
const CHAIN    = String(arg("chain", "arcTestnet"))
const DEPOSIT  = arg("deposit", null)
const DRY      = has("dry-run")
const STATUS   = has("status")
const PK       = process.env.BUYER_PRIVATE_KEY
const RPC      = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const REPUTATION_REGISTRY = process.env.REPUTATION_REGISTRY || "0x2A19ad056EaE83364B0a6420685974cA219c209E"
const SELLER_AGENT_ID = Number(process.env.SELLER_AGENT_ID || "1")
const NO_FEEDBACK = has("no-feedback")
const SCORE = arg("score", null)
const STREAM = has("stream")
const SECONDS = arg("seconds", "10")
const STREAM_BUDGET = Number(arg("stream-budget", "0.05"))

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
  const gateway = new GatewayClient({ chain: CHAIN, privateKey: PK.startsWith("0x") ? PK : "0x" + PK, ...(process.env.ARC_RPC ? { rpcUrl: process.env.ARC_RPC } : {}) })
  log("    agent address:", gateway.address, "| chain:", CHAIN)

  step(4, "Check balances")
  let balances
  try {
    balances = await gateway.getBalances()
    log("    wallet USDC:", balances.wallet.formatted)
    log("    gateway USDC (available):", balances.gateway.formattedAvailable)
  } catch (e) { log("    (balance check failed: " + (e.message || e) + ")") }

  if (STATUS) { log("\n[status] balances only — no deposit, no payment."); return }

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

  if (STREAM) {
    const seconds = Math.max(1, Number(SECONDS) || 10)
    const projected = seconds * priceUsd
    if (projected > STREAM_BUDGET) {
      log("    ABORT: projected " + projected.toFixed(6) + " USDC exceeds --stream-budget " + STREAM_BUDGET + " USDC")
      process.exit(2)
    }
    step(5, "STREAM: pay-per-second nano stream via Circle Gateway (" + seconds + "s @ " + priceUsd + " USDC/sec, budget " + STREAM_BUDGET + ")")
    let spent = 0
    let delivered = 0
    const settlements = []
    for (let i = 1; i <= seconds; i++) {
      const t0 = Date.now()
      try {
        const sUrl = resource + "?topic=" + encodeURIComponent(TOPIC) + "&stream=" + i
        const r = await gateway.pay(sUrl)
        spent += Number(r.formattedAmount || priceUsd)
        const d = r.data || {}
        const rep = d.report || {}
        if (rep.verdict) delivered++
        if (r.transaction) settlements.push(r.transaction)
        log("    [" + i + "/" + seconds + "] paid " + (r.formattedAmount || priceUsd) + " USDC | settlement " + (r.transaction || "(batched)") + " | verdict " + (rep.verdict || "-"))
      } catch (e) {
        log("    [" + i + "/" + seconds + "] tick failed (non-fatal): " + String(e.message || e).slice(0, 100))
      }
      const dt = Date.now() - t0
      if (dt < 1000) await new Promise((res) => setTimeout(res, 1000 - dt))
    }
    step("STREAM-OK", "streamed " + seconds + "s | signals " + delivered + " | spent " + spent.toFixed(6) + " USDC | settlements " + settlements.length)
    if (!NO_FEEDBACK && settlements.length) {
      try {
        const jobRef = ethers.id("cronus:stream:" + settlements[0])
        const score = SCORE ? Math.max(1, Math.min(5, Number(SCORE))) : (delivered ? 5 : 3)
        const repAbi = ["function giveFeedback(uint256 providerAgentId, uint8 score, bytes32 jobRef, string uri) returns (uint256)", "function getReputation(uint256 a) view returns (uint256,uint256,uint256)"]
        const provider = new ethers.JsonRpcProvider(RPC)
        const signer = new ethers.Wallet(PK.startsWith("0x") ? PK : "0x" + PK, provider)
        const contract = new ethers.Contract(REPUTATION_REGISTRY, repAbi, signer)
        const tx = await contract.giveFeedback(SELLER_AGENT_ID, score, jobRef, MANIFEST)
        log("    [feedback] stream batch tx:", tx.hash)
        await tx.wait()
        log("    explorer:", "https://testnet.arcscan.app/tx/" + tx.hash)
        const rr = await contract.getReputation(SELLER_AGENT_ID)
        log("    seller reputation now: count=" + rr[0] + " avg=" + (Number(rr[2]) / 100).toFixed(2) + "/5")
      } catch (e) {
        log("    [feedback] stream feedback failed (non-fatal):", String(e.message || e).slice(0, 140))
      }
    }
    return
  }
  step(5, "Pay (gas-free EIP-3009 via Circle Gateway) and consume")
  const url = resource + "?topic=" + encodeURIComponent(TOPIC)
  const result = await gateway.pay(url)
  const data = result.data || {}
  log("    settled. amount:", result.formattedAmount, "USDC")
  log("    settlement tx:", result.transaction || "(batched/pending)")
  if (isOnchainTx(result.transaction)) log("    explorer:", "https://testnet.arcscan.app/tx/" + result.transaction)
    else if (result.transaction) log("    settlement id (Circle Gateway batch; on-chain tx pending):", result.transaction)

  step(6, "Consumed signal (A2A)")
  const rep = data.report || {}
  log("    verdict:", rep.verdict, "| conviction:", rep.conviction)
  if (data.payment) log("    seller-reported settlement:", data.payment.settlement, data.payment.explorer || "")

  step("OK", "Autonomous A2A purchase complete (honest label: agent-to-agent demo).")
  if (NO_FEEDBACK) {
      log("    [feedback] skipped (--no-feedback).")
    } else {
      step("P6b", "Write ERC-8004 reputation feedback for the seller agent")
      try {
        const settlementId = String(result.transaction || (data && data.payment && data.payment.settlement) || "")
        const jobRef = settlementId ? ethers.id("cronus:nano:" + settlementId) : ethers.ZeroHash
        const delivered = !!(rep && rep.verdict && rep.conviction != null)
        const score = SCORE ? Math.max(1, Math.min(5, Number(SCORE))) : (delivered ? 5 : 3)
        log("    score:", score, "(delivery quality, NOT verdict endorsement) | seller agentId:", SELLER_AGENT_ID)
        const repAbi = ["function giveFeedback(uint256 providerAgentId, uint8 score, bytes32 jobRef, string uri) returns (uint256)", "function getReputation(uint256 a) view returns (uint256,uint256,uint256)"]
        const provider = new ethers.JsonRpcProvider(RPC)
        const signer = new ethers.Wallet(PK.startsWith("0x") ? PK : "0x" + PK, provider)
        const contract = new ethers.Contract(REPUTATION_REGISTRY, repAbi, signer)
        const tx = await contract.giveFeedback(SELLER_AGENT_ID, score, jobRef, MANIFEST)
        log("    feedback tx:", tx.hash)
        await tx.wait()
        log("    explorer:", "https://testnet.arcscan.app/tx/" + tx.hash)
        const r = await contract.getReputation(SELLER_AGENT_ID)
        log("    seller reputation now: count=" + r[0] + " avg=" + (Number(r[2]) / 100).toFixed(2) + "/5")
      } catch (e) {
        log("    [feedback] failed (non-fatal):", String(e.message || e).slice(0, 140))
      }
    }
}

main().catch((e) => { console.error("\n[buyer-agent] FAILED:", e.message || e); process.exit(1) })
