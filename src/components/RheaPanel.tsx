// src/components/RheaPanel.tsx — Rhea: autonomous buyer, m2m price discovery.
// Data: free quote endpoint (/api/nano-signal?quote=1) + public m2m-ledger/*.json from the repo.
// HONEST LABEL: Rhea is our own buyer agent (A2A demo between two project wallets), clearly disclosed.
import { useEffect, useState } from "react"
import type { CSSProperties } from "react"

type Quality = { delivered?: boolean; verdict?: string; conviction?: number }
type Entry = { agent?: string; ts?: string; topic?: string; action?: string; paidUsd?: number; purchases?: number; loyal?: boolean; reason?: string; settlement?: string; quality?: Quality; quote?: { tier?: string; price?: string } }
type Quote = { purchases?: number; loyal?: boolean; loyaltyThreshold?: number; prices?: Record<string, string>; offered?: { tier?: string; price?: string } }

const LEDGER_BASE = "https://raw.githubusercontent.com/Artem1981777/CronusCapital/main/m2m-ledger/"
const RHEA_ADDR = "0xbe3a16bD4137A8a293aCBcaA75cCE3420919D21d"
const GOLD = "#c9a84c"
const GREEN = "#39e014"

const card: CSSProperties = { border: "1px solid " + GOLD + "44", borderRadius: 8, padding: "12px 16px", minWidth: 130, background: "#00000055" }
const lbl: CSSProperties = { fontSize: 10, letterSpacing: 2, color: GOLD, textTransform: "uppercase" }
const val: CSSProperties = { fontSize: 20, color: GREEN, fontFamily: "monospace", marginTop: 4 }
const td: CSSProperties = { padding: "6px 10px", borderBottom: "1px solid " + GOLD + "22", fontFamily: "monospace", fontSize: 12, color: "#ddd" }

function day(offset: number) { return new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10) }
function actionColor(a?: string) {
  if (a === "BUY") return GREEN
  if (a === "WALK_AWAY") return "#ff5555"
  if (a === "DEFER") return GOLD
  return "#888"
}

export function RheaPanel() {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])

  useEffect(() => {
    fetch("/api/nano-signal?quote=1&payer=" + RHEA_ADDR).then(r => r.json()).then(setQuote).catch(() => {})
    Promise.all([0, 1, 2, 3, 4, 5, 6].map(o =>
      fetch(LEDGER_BASE + day(o) + ".json").then(r => (r.ok ? r.json() : [])).catch(() => [])
    )).then(all => {
      const merged = ([] as Entry[]).concat(...all)
      merged.sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")))
      setEntries(merged)
    })
  }, [])

  const buys = entries.filter(e => e.action === "BUY")
  const spent = buys.reduce((s, e) => s + Number(e.paidUsd || 0), 0)
  const threshold = (quote && quote.loyaltyThreshold) || 10
  const purchases = (quote && quote.purchases) || 0
  const offered = (quote && quote.offered && quote.offered.price) || "..."
  const prices = (quote && quote.prices) || {}

  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ ...lbl, fontSize: 12, marginBottom: 4 }}>RHEA — AUTONOMOUS BUYER (M2M PRICE DISCOVERY)</div>
      <div style={{ fontSize: 12, color: "#999", marginBottom: 14 }}>
        Rhea requests a personalized quote, negotiates against a reserve price and a daily budget, then buys, walks away, or defers. Every decision lands in a public git ledger.
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={card}><div style={lbl}>Trades (7d)</div><div style={val}>{buys.length}</div></div>
        <div style={card}><div style={lbl}>Spent USDC</div><div style={val}>{spent.toFixed(4)}</div></div>
        <div style={card}><div style={lbl}>Offered now</div><div style={val}>{offered}</div></div>
        <div style={card}><div style={lbl}>Loyalty</div><div style={val}>{quote && quote.loyal ? "ACTIVE" : purchases + " / " + threshold}</div></div>
      </div>
      <div style={{ ...lbl, marginBottom: 6 }}>Live price grid</div>
      <div style={{ fontFamily: "monospace", fontSize: 12, color: "#ddd", marginBottom: 16 }}>
        nano {String(prices["nano"] || "-")} &nbsp;|&nbsp; nano (loyal, {threshold}+ buys) {String(prices["nanoLoyal"] || "-")} &nbsp;|&nbsp; dataset {String(prices["dataset"] || "-")}
      </div>
      <div style={{ ...lbl, marginBottom: 6 }}>Decision ledger (last 7 days)</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...td, color: GOLD, textAlign: "left" }}>time (UTC)</th>
              <th style={{ ...td, color: GOLD, textAlign: "left" }}>action</th>
              <th style={{ ...td, color: GOLD, textAlign: "left" }}>paid</th>
              <th style={{ ...td, color: GOLD, textAlign: "left" }}>verdict</th>
              <th style={{ ...td, color: GOLD, textAlign: "left" }}>note</th>
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 20).map((e, i) => (
              <tr key={i}>
                <td style={td}>{String(e.ts || "").slice(0, 16).replace("T", " ")}</td>
                <td style={{ ...td, color: actionColor(e.action), fontWeight: 700 }}>{e.action || "-"}</td>
                <td style={td}>{e.action === "BUY" ? Number(e.paidUsd || 0).toFixed(4) + " USDC" : "-"}</td>
                <td style={td}>{(e.quality && e.quality.verdict) || "-"}</td>
                <td style={{ ...td, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.reason || e.settlement || "-"}</td>
              </tr>
            ))}
            {entries.length === 0 && (<tr><td style={td} colSpan={5}>no ledger entries yet</td></tr>)}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: "#777", marginTop: 12 }}>
        HONEST LABEL: Rhea is our own buyer agent (agent-to-agent demo between two project wallets). The quote payer is self-declared; ERC-8004 identity binding is the next step. Ledger source: m2m-ledger/ in the public repo.
      </div>
    </div>
  )
}
