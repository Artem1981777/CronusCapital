// CoverPanel.tsx — Cronus Cover: parametric price-drop micro-insurance (additive hackathon module).
// Quote -> buy (demo, labeled) -> live policy feed. Backed by /api/cover (lib/cover.js).
import { useEffect, useState } from "react"
import { useAccount } from "wagmi"
import type { CSSProperties } from "react"

type Quote = { ok: boolean; market?: string; openPrice?: number; thresholdPct?: number; payoutUsdc?: number; premiumUsdc?: number; probEstimate?: number; error?: string }
type Policy = { id: string; market: string; rule: string; openPrice: number; payoutUsdc: number; premiumUsdc: number; status: string; demo: boolean; resolveBy: number }

const MARKETS = ["BTC-USDC", "ETH-USDC", "SOL-USDC", "BNB-USDC"]
const gold = "#d4b26a"
const card: CSSProperties = { border: "1px solid rgba(212,178,106,0.35)", borderRadius: 12, padding: 16, background: "rgba(10,20,12,0.72)", marginBottom: 12 }
const btn: CSSProperties = { background: "transparent", border: "1px solid " + gold, color: gold, borderRadius: 8, padding: "8px 14px", cursor: "pointer", letterSpacing: 1 }
const inp: CSSProperties = { background: "rgba(0,0,0,0.4)", border: "1px solid rgba(212,178,106,0.35)", color: "#cfe8cf", borderRadius: 8, padding: "8px 10px" }

export function CoverPanel() {
  const { address } = useAccount()
  const [market, setMarket] = useState("BTC-USDC")
  const [threshold, setThreshold] = useState("2")
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const [policies, setPolicies] = useState<Policy[]>([])

  async function loadPolicies() {
    try { const r = await fetch("/api/cover"); const j = await r.json(); setPolicies(Array.isArray(j.policies) ? j.policies : []) } catch { /* ignore */ }
  }
  useEffect(() => { loadPolicies(); const t = setInterval(loadPolicies, 15000); return () => clearInterval(t) }, [])

  async function getQuote() {
    setBusy(true); setNote(""); setQuote(null)
    try {
      const r = await fetch("/api/cover?action=quote&market=" + market + "&threshold=" + threshold + "&payout=0.05&horizon=86400")
      setQuote(await r.json())
    } catch (e) { setNote(String(e)) }
    setBusy(false)
  }

  async function buyDemo() {
    if (!quote || !quote.ok) return
    setBusy(true); setNote("")
    try {
      const r = await fetch("/api/cover?action=buy", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ buyer: address || "0x46213abeca58cc9a89a269fd25a8737c700ca164", market, thresholdPct: Number(threshold), payoutUsdc: 0.05, horizonSec: 86400 }),
      })
      const j = await r.json()
      setNote(j.ok ? "Policy opened (DEMO) · commitment " + String(j.policy?.commitment || "").slice(0, 18) + "…" : "Error: " + j.error)
      loadPolicies()
    } catch (e) { setNote(String(e)) }
    setBusy(false)
  }

  return (
    <section id="cap-cover" style={{ padding: "24px 0" }}>
      <h2 style={{ color: gold, letterSpacing: 2 }}>🛡 CRONUS COVER <span style={{ fontSize: 12, border: "1px solid " + gold, borderRadius: 6, padding: "2px 6px", marginLeft: 8 }}>PARAMETRIC · NEW</span></h2>
      <p style={{ color: "#9fbf9f", maxWidth: 640 }}>
        Micro-insurance against price drops. The oracle prices the risk, the premium is paid in USDC (x402-style),
        the policy is committed on-chain (keccak256) BEFORE the outcome, and payouts are automatic at expiry — capped and verifiable.
      </p>
      <div style={card}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={market} onChange={(e) => setMarket(e.target.value)} style={inp}>
            {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <label style={{ color: "#9fbf9f" }}>drop ≥
            <input value={threshold} onChange={(e) => setThreshold(e.target.value)} style={{ ...inp, width: 56, margin: "0 6px" }} />%
          </label>
          <button style={btn} disabled={busy} onClick={getQuote}>{busy ? "…" : "GET QUOTE"}</button>
          {quote && quote.ok && <button style={{ ...btn, borderColor: "#7fd77f", color: "#7fd77f" }} disabled={busy} onClick={buyDemo}>BUY (DEMO)</button>}
        </div>
        {quote && quote.ok && (
          <div style={{ marginTop: 12, color: "#cfe8cf" }}>
            Open price <b>${quote.openPrice}</b> · payout <b>{quote.payoutUsdc} USDC</b> · premium <b style={{ color: gold }}>{quote.premiumUsdc} USDC</b> · est. prob {Math.round((quote.probEstimate || 0) * 100)}% · 24h horizon
          </div>
        )}
        {quote && !quote.ok && <div style={{ marginTop: 12, color: "#e08080" }}>{quote.error}</div>}
        {note && <div style={{ marginTop: 8, color: "#9fbf9f" }}>{note}</div>}
      </div>
      <div style={card}>
        <div style={{ color: gold, letterSpacing: 1, marginBottom: 8 }}>POLICY LEDGER ({policies.length})</div>
        {policies.length === 0 && <div style={{ color: "#9fbf9f" }}>No policies yet.</div>}
        {policies.slice(0, 8).map((p) => (
          <div key={p.id} style={{ display: "flex", gap: 10, flexWrap: "wrap", borderTop: "1px solid rgba(212,178,106,0.15)", padding: "6px 0", color: "#cfe8cf", fontSize: 13 }}>
            <span>{p.market}</span><span>{p.rule}</span><span>open ${p.openPrice}</span>
            <span>payout {p.payoutUsdc}</span><span>premium {p.premiumUsdc}</span>
            <span style={{ color: p.status === "PAID" ? "#7fd77f" : p.status === "OPEN" ? gold : "#9fbf9f" }}>{p.status}{p.demo ? " · DEMO" : ""}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
