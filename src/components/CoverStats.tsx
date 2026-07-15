import { useEffect, useState } from "react"

const num = (x: any) => { const n = Number(x); return isFinite(n) ? n : 0 }
const fmt = (x: number) => {
  const s = x.toFixed(6).replace(/\.?0+$/, "")
  return s === "" || s === "-" ? "0" : s
}

export default function CoverStats() {
  const [list, setList] = useState<any[]>([])
  const [ts, setTs] = useState("")

  useEffect(() => {
    let alive = true
    const load = () => {
      fetch("/api/cover")
        .then((r) => r.json())
        .then((j) => {
          const arr = j.policies || j.ledger || j.list || []
          if (alive && Array.isArray(arr)) {
            setList(arr)
            setTs(new Date().toLocaleTimeString())
          }
        })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 15000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const st = (p: any) => String(p.status || "").toUpperCase()
  const isReal = (p: any) =>
    p.real === true || p.demo === false ||
    String(p.mode || p.kind || "").toUpperCase() === "REAL" ||
    !!(p.premiumTx || p.paymentTx || p.txHash)

  const open = list.filter((p) => st(p) === "OPEN")
  const paid = list.filter((p) => st(p).indexOf("PAID") === 0)
  const expired = list.filter((p) => st(p) === "EXPIRED")
  const real = list.filter(isReal)
  const premiums = list.reduce((s, p) => s + num(p.premiumUsdc), 0)
  const realPremiums = real.reduce((s, p) => s + num(p.premiumUsdc), 0)
  const payouts = paid.reduce((s, p) => s + num(p.payoutUsdc), 0)
  const exposure = open.reduce((s, p) => s + num(p.payoutUsdc), 0)
  const pnl = premiums - payouts
  const resolved = expired.length + paid.length
  const keepRate = resolved > 0 ? (expired.length / resolved) * 100 : 100
  const lossRatio = premiums > 0 ? (payouts / premiums) * 100 : 0
  const capPct = Math.min(100, (exposure / 0.25) * 100)
  const avgPremium = list.length > 0 ? premiums / list.length : 0

  const tile = (label: string, value: string, sub: string, color?: string) => (
    <div key={label} style={{ flex: "1 1 140px", minWidth: 130, padding: "10px 12px", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 8, background: "rgba(0,24,12,0.45)" }}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, color: "rgba(217,201,138,0.75)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || "#e8d48b", marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: "rgba(217,201,138,0.55)", marginTop: 2 }}>{sub}</div>
    </div>
  )

  const bar = (label: string, pct: number, right: string, color: string) => (
    <div key={label} style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, letterSpacing: 1.5, color: "rgba(217,201,138,0.75)", textTransform: "uppercase", marginBottom: 4 }}>
        <span>{label}</span><span>{right}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "rgba(212,175,55,0.15)", overflow: "hidden" }}>
        <div style={{ width: pct.toFixed(1) + "%", height: "100%", background: color, transition: "width .6s" }} />
      </div>
    </div>
  )

  return (
    <div style={{ marginTop: 14, padding: 14, border: "1px solid rgba(212,175,55,0.35)", borderRadius: 10, background: "rgba(0,0,0,0.35)" }}>
      <style>{"@keyframes cvPulse{0%{opacity:1}50%{opacity:.25}100%{opacity:1}}"}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3dff8b", boxShadow: "0 0 8px #3dff8b", animation: "cvPulse 1.6s infinite" }} />
        <span style={{ fontSize: 12, letterSpacing: 2, color: "#e8d48b", textTransform: "uppercase", fontWeight: 700 }}>Live underwriting metrics</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(217,201,138,0.5)" }}>{ts ? "updated " + ts : "loading..."}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {tile("Policies sold", String(list.length), real.length + " real / " + (list.length - real.length) + " demo")}
        {tile("Open now", String(open.length), fmt(exposure) + " USDC at risk")}
        {tile("Premiums collected", fmt(premiums), fmt(realPremiums) + " USDC real")}
        {tile("Payouts paid", fmt(payouts), paid.length + " claims")}
        {tile("Underwriting P&L", (pnl >= 0 ? "+" : "") + fmt(pnl), "premiums minus payouts", pnl >= 0 ? "#3dff8b" : "#ff6b6b")}
        {tile("Keep rate", keepRate.toFixed(0) + "%", resolved + " resolved / " + expired.length + " kept")}
        {tile("Avg premium", fmt(avgPremium), "USDC per policy")}
      </div>
      {bar("Daily payout cap utilization", capPct, fmt(exposure) + " / 0.25 USDC", "linear-gradient(90deg,#3dff8b,#e8d48b)")}
      {bar("Loss ratio", Math.min(100, lossRatio), lossRatio.toFixed(1) + "%", lossRatio < 50 ? "#3dff8b" : "#ff6b6b")}
    </div>
  )
}
