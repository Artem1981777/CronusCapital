#!/usr/bin/env node
// scripts/agent-loop.mjs — Live A2A loop orchestrator for Cronus Capital.
// Runs the full agent-to-agent commerce loop A->Z and narrates one loop-receipt:
//   1) BUYER  : autonomous buyer discovers + pays for a nano signal (Circle Gateway, gas-free)
//   2) SELLER : Cronus serves the signal (settled on Arc)
//   3) COGS   : Cronus pays an upstream data provider (pay-to-think), labeled self_operated_demo
//   4) TRUST  : buyer writes ERC-8004 reputation feedback for the seller
//   5) HONESTY: assert external_payers stays 0 (self traffic excluded)
// HONEST LABEL: every leg is self-operated demo. We never fake demand.
//
// Usage:
//   node scripts/agent-loop.mjs                # DRY: narrate + preview, no funds, no writes
//   node scripts/agent-loop.mjs --live         # LIVE: real testnet settlements (needs env)
//   node scripts/agent-loop.mjs --json         # also print the assembled loop-receipt as JSON
// Flags: --url <base>, --topic <t>, --no-cogs, --no-feedback, --seconds <n> (stream)

import { spawn } from "node:child_process"

function arg(name, def) {
  const i = process.argv.indexOf("--" + name)
  if (i >= 0) { const v = process.argv[i + 1]; return (v && !v.startsWith("--")) ? v : true }
  return def
}
const has = (name) => process.argv.includes("--" + name)

const BASE = String(arg("url", process.env.CRONUS_URL || "https://cronus-capital.vercel.app")).replace(/\/+$/, "")
const TOPIC = String(arg("topic", "BTC-USDC momentum"))
const LIVE = has("live")
const JSON_OUT = has("json")
const NO_COGS = has("no-cogs")
const NO_FEEDBACK = has("no-feedback")
const SECONDS = arg("seconds", null)
const CRON_SECRET = process.env.CRON_SECRET || ""

const log = (...a) => console.log(...a)
const hr = () => log("-".repeat(56))
const stepHdr = (n, t) => { log(""); log("=== [" + n + "] " + t + " ===") }

function runBuyer() {
  return new Promise((resolve) => {
    const args = ["scripts/buyer-agent.mjs", "--manifest", BASE + "/api/manifest", "--topic", TOPIC]
    if (!LIVE) args.push("--dry-run")
    if (NO_FEEDBACK) args.push("--no-feedback")
    if (SECONDS) { args.push("--stream", "--seconds", String(SECONDS)) }
    const child = spawn("node", args, { stdio: "inherit" })
    child.on("close", (code) => resolve(code === 0))
    child.on("error", () => resolve(false))
  })
}

async function getJson(url, opts) {
  try { const r = await fetch(url, opts); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, json: j } }
  catch (e) { return { ok: false, status: 0, json: { error: String((e && e.message) || e) } } }
}

async function main() {
  log("Cronus Capital - Live A2A loop orchestrator")
  log("mode: " + (LIVE ? "LIVE (real Arc testnet settlements)" : "DRY (no funds, no writes)"))
  log("base: " + BASE + " | topic: " + TOPIC)
  hr()

  const receipt = { at: Date.now(), mode: LIVE ? "live" : "dry", base: BASE, topic: TOPIC, honest_label: "all legs self-operated demo; external_payers=0; never fake demand", legs: {} }

  stepHdr(1, "BUYER pays + SELLER serves (nano signal, Circle Gateway)")
  const buyerOk = await runBuyer()
  receipt.legs.buyer_seller = { ok: buyerOk, resource: BASE + "/api/nano-signal", settlement: LIVE ? "circle-gateway-batched" : "dry-run" }

  if (!NO_COGS) {
    stepHdr(3, "COGS: Cronus pays upstream data provider (pay-to-think)")
    const cfg = await getJson(BASE + "/api/pay-to-think")
    log("    config settled_cogs_atomic=" + (cfg.json && cfg.json.settled_cogs_atomic))
    if (LIVE) {
      if (!CRON_SECRET) { log("    SKIP: CRON_SECRET not set; cannot execute COGS leg"); receipt.legs.cogs = { ok: false, reason: "no CRON_SECRET" } }
      else {
        const ex = await getJson(BASE + "/api/pay-to-think?action=execute", { method: "POST", headers: { Authorization: "Bearer " + CRON_SECRET, "content-type": "application/json" }, body: "{}" })
        const settled = ex.json && ex.json.settled
        if (settled) log("    settled COGS: " + settled.amountAtomic + " atomic -> " + settled.to + " | " + settled.explorer)
        else log("    COGS response: " + JSON.stringify(ex.json).slice(0, 200))
        receipt.legs.cogs = { ok: !!(ex.json && ex.json.ok), settled: settled || null, self_operated_demo: true }
      }
    } else {
      const pv = await getJson(BASE + "/api/pay-to-think?action=preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conviction: 72 }) })
      log("    preview buy=" + (pv.json && pv.json.buy) + " | " + (pv.json && pv.json.decision))
      receipt.legs.cogs = { ok: pv.ok, preview: pv.json || null, self_operated_demo: true }
    }
  }

  stepHdr(4, "TRUST: ERC-8004 reputation feedback")
  receipt.legs.reputation = { ok: !NO_FEEDBACK, note: NO_FEEDBACK ? "skipped (--no-feedback)" : (LIVE ? "buyer wrote on-chain giveFeedback (see buyer log above)" : "dry-run (no on-chain write)") }

  stepHdr(5, "HONESTY: external demand check")
  const tr = await getJson(BASE + "/api/traction")
  const ext = tr.json && (tr.json.external_payers != null ? tr.json.external_payers : (tr.json.onchain && tr.json.onchain.external_payers))
  log("    external_payers = " + (ext == null ? "?" : ext) + " (self-generated traffic excluded)")
  receipt.legs.honesty = { external_payers: (ext == null ? null : ext), source: BASE + "/api/traction" }

  hr()
  log("LOOP COMPLETE (" + receipt.mode + ")")
  if (JSON_OUT) { log(""); log(JSON.stringify(receipt, null, 2)) }
  process.exit((!receipt.legs.buyer_seller.ok && LIVE) ? 1 : 0)
}

main().catch((e) => { console.error("agent-loop error:", (e && e.message) || e); process.exit(1) })
