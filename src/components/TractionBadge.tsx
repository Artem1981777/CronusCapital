import { useEffect, useState, type CSSProperties } from "react"

type Metrics = {
  ok?: boolean
  payments?: number
  totalUsdc?: number
  lastTx?: string
  explorer?: string | null
  source?: string
}

const wrap: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 10px", borderRadius: 999, border: "1px solid rgba(120,200,140,0.4)", background: "rgba(40,80,55,0.25)", fontSize: 12, fontFamily: "ui-monospace, monospace", color: "#bfe9cb" }
const dot: CSSProperties = { width: 7, height: 7, borderRadius: 999, background: "#39d98a", boxShadow: "0 0 6px #39d98a" }
const sep: CSSProperties = { opacity: 0.5 }
const link: CSSProperties = { color: "#bfe9cb", textDecoration: "underline", opacity: 0.85 }

export default function TractionBadge() {
  const [m, setM] = useState<Metrics | null>(null)
  useEffect(() => {
    let alive = true
    fetch("/api/metrics").then((r) => r.json()).then((d) => { if (alive) setM(d) }).catch(() => {})
    return () => { alive = false }
  }, [])
  if (!m || !m.ok) return null
  const payments = Number(m.payments || 0)
  const usdc = Number(m.totalUsdc || 0)
  return (
    <div style={wrap} title={"Live on-chain x402 settlement (source: " + String(m.source || "") + ")"}>
      <span style={dot} />
      <span>{payments} x402 payments</span>
      <span style={sep}>·</span>
      <span>{usdc.toFixed(2)} USDC settled on Arc</span>
      {m.explorer ? (<a style={link} href={m.explorer} target="_blank" rel="noreferrer">last tx</a>) : null}
    </div>
  )
}
