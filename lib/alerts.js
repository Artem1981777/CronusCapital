// lib/alerts.js — Telegram alerts for all Cronus parameters (cron-driven, routed via /api/info?kind=alerts)
const BASE = "https://cronus-capital.vercel.app"
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const TG = process.env.TELEGRAM_BOT_TOKEN
const CHAT = process.env.TELEGRAM_CHAT_ID

const kvGet = async (k) => {
  const r = await fetch(KV_URL + "/get/" + k, { headers: { Authorization: "Bearer " + KV_TOKEN } })
  const j = await r.json().catch(() => ({}))
  try { return j.result ? JSON.parse(j.result) : null } catch { return null }
}
const kvSet = (k, v) => fetch(KV_URL + "/set/" + k, {
  method: "POST", headers: { Authorization: "Bearer " + KV_TOKEN }, body: JSON.stringify(v),
})
const tg = (text) => fetch("https://api.telegram.org/bot" + TG + "/sendMessage", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "HTML", disable_web_page_preview: true }),
})
const getJson = async (p) => {
  try { const r = await fetch(BASE + p); return r.ok ? await r.json() : { __down: r.status } }
  catch (e) { return { __down: String(e).slice(0, 80) } }
}
const walk = (o, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), o)
const num = (o, paths) => { for (const p of paths) { const v = walk(o, p); if (v != null && !isNaN(Number(v))) return Number(v) } return null }
const arr = (o, paths) => { for (const p of paths) { const v = walk(o, p); if (Array.isArray(v)) return v } return null }

export default async function handler(req, res) {
  const q = req.query || {}
  const secret = q.secret || (req.headers.authorization || "").replace("Bearer ", "")
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET)
    return res.status(401).json({ error: "unauthorized" })
  if (q.action === "test") { await tg("✅ Cronus alerts online"); return res.json({ ok: true }) }

  const [metrics, cover, track, traction, spend, payout, signer, settle, vault] = await Promise.all([
    getJson("/api/metrics"), getJson("/api/cover"), getJson("/api/track-record"),
    getJson("/api/traction"), getJson("/api/spend-limit"),
    getJson("/api/agent-payout"), getJson("/api/agent-payout?action=signer-info"),
    getJson("/api/settlements"), getJson("/api/info?kind=vault-nav"),
  ])

  const policies = arr(cover, ["policies", "ledger", "items"]) || []
  const isResolved = (p) => p.resolved === true || ["resolved", "expired", "paid", "settled"].includes(String(p.status || "").toLowerCase())
  const ledger = arr(payout, ["ledger", "payouts", "entries"]) || []
  const navSnaps = arr(vault, ["snapshots"]) || []
  const lastNav = navSnaps.length ? Number(navSnaps[navSnaps.length - 1].nav) : null

  const snap = {
    payments: num(metrics, ["payments", "paymentCount", "x402.payments", "totals.payments", "count"]),
    usdc: num(metrics, ["totalUsdc", "settledUsdc", "usdcSettled", "totals.usdc", "usdc"]),
    policiesSold: policies.length || num(cover, ["policiesSold", "sold", "count"]),
    policiesResolved: policies.filter(isResolved).length,
    coverPaid: policies.filter((p) => String(p.status || "").toLowerCase() === "paid").length,
    stakesOpen: num(track, ["open_positions"]),
    stakesResolved: num(track, ["resolved_positions"]),
    stakesCorrect: num(track, ["correct", "stats.correct"]),
    stakesWrong: num(track, ["wrong", "stats.wrong"]),
    externalPayers: num(traction, ["external_payers", "externalPayers", "external"]),
    payoutsExecuted: ledger.filter((e) => e.executed === true).length,
    settlements: num(settle, ["rails.directOnchain.count"]),
    settlementsUsdc: num(settle, ["rails.directOnchain.totalUsdc"]),
    vaultNav: lastNav,
    spendRemaining: num(spend, ["remainingDailyAtomic"]) != null ? num(spend, ["remainingDailyAtomic"]) / (num(spend, ["scale"]) || 1000000) : null,
    signerNative: num(signer, ["nativeWei"]) != null ? num(signer, ["nativeWei"]) / 1e18 : null,
    signerUsdc: num(signer, ["usdc6"]) != null ? num(signer, ["usdc6"]) / 1e6 : null,
  }
  if (q.action === "debug") return res.json({ snap })

  const prev = (await kvGet("alerts:last")) || {}
  const a = []
  const grew = (k) => snap[k] != null && prev[k] != null && snap[k] > prev[k]

  for (const [name, d] of [["metrics", metrics], ["cover", cover], ["track-record", track], ["traction", traction], ["spend-limit", spend], ["agent-payout", payout], ["settlements", settle], ["vault-nav", vault]])
    if (d && d.__down !== undefined && !prev["down_" + name]) a.push("🔴 <b>" + name + "</b> endpoint down (" + d.__down + ")")

  if (grew("payments")) a.push("💰 <b>+" + (snap.payments - prev.payments) + " x402 payment(s)</b> — total " + snap.payments + (snap.usdc != null ? " (~" + snap.usdc + " USDC settled)" : ""))
  if (grew("policiesSold")) a.push("🛡 <b>New Cover policy sold!</b> Total: " + snap.policiesSold)
  if (grew("policiesResolved")) a.push("🛡 Cover policy <b>resolved autonomously</b> (" + snap.policiesResolved + "/" + snap.policiesSold + ")")
  if (grew("coverPaid")) a.push("💸 <b>Cover PAYOUT triggered!</b> Insurance paid out on-chain — total " + snap.coverPaid)
  if (grew("stakesOpen")) a.push("🎲 <b>Agent opened a conviction stake</b> — real USDC at risk, committed on-chain")
  if (grew("stakesCorrect")) a.push("🎯 Stake resolved <b>CORRECT</b> — principal returned ✅")
  if (grew("stakesWrong")) a.push("🔥 Stake resolved <b>WRONG</b> — stake burned to 0x...dEaD")
  if (grew("externalPayers")) a.push("🚀🚀 <b>EXTERNAL PAYER #" + snap.externalPayers + "!</b> Check /api/leaderboard")
  if (grew("payoutsExecuted")) a.push("🏦 <b>Autonomous CCTP payout executed</b> (Arc→Stellar) — total " + snap.payoutsExecuted)
  if (grew("settlements")) a.push("🌉 <b>New on-chain settlement!</b> Total " + snap.settlements + " (~" + snap.settlementsUsdc + " USDC direct on-chain)")
  if (snap.vaultNav != null && prev.vaultNav != null && Math.abs(snap.vaultNav - prev.vaultNav) >= 0.01) a.push("🏛 <b>Vault NAV changed:</b> " + prev.vaultNav + " → " + snap.vaultNav + " USDC")
  if (snap.signerNative != null && snap.signerNative < 1 && !prev.warnedNative) a.push("⚠️ Treasury signer native balance low: " + snap.signerNative)
  if (snap.signerUsdc != null && snap.signerUsdc < 1 && !prev.warnedUsdc) a.push("⚠️ Treasury signer USDC low: " + snap.signerUsdc)
  if (snap.spendRemaining != null && snap.spendRemaining <= 0.1 && !prev.warnedSpend) a.push("⚠️ Daily spend limit almost exhausted: " + snap.spendRemaining + " USDC left")

  if (a.length) await tg("𓂀 <b>Cronus Capital</b>\n\n" + a.join("\n\n"))
  await kvSet("alerts:last", {
    ...snap,
    warnedNative: snap.signerNative != null && snap.signerNative < 1,
    warnedUsdc: snap.signerUsdc != null && snap.signerUsdc < 1,
    warnedSpend: snap.spendRemaining != null && snap.spendRemaining <= 0.1,
    down_metrics: metrics.__down !== undefined, down_cover: cover.__down !== undefined,
    "down_track-record": track.__down !== undefined, down_traction: traction.__down !== undefined,
    "down_spend-limit": spend.__down !== undefined, "down_agent-payout": payout.__down !== undefined,
    down_settlements: settle.__down !== undefined, "down_vault-nav": vault.__down !== undefined,
  })
  return res.json({ ok: true, alertsSent: a.length, snap })
}
