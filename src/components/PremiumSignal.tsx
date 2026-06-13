import { useState } from "react"
import { useAccount } from "wagmi"
import { usePaidSignal } from "../hooks/usePaidSignal"

const PRICE_USD = 0.02
const EARN_KEY = "cronus_earnings"

interface Opportunity { question: string; recommendation: "YES" | "NO"; expectedValue: number; size: number; reasoning: string }
interface Report { topic: string; thesis: string; opportunities: Opportunity[]; riskNote: string }

function loadStats(): { calls: number; usd: number } {
  try { return JSON.parse(localStorage.getItem(EARN_KEY) || '{"calls":0,"usd":0}') }
  catch { return { calls: 0, usd: 0 } }
}

export function PremiumSignal() {
  const { isConnected } = useAccount()
  const { buySignal } = usePaidSignal()
  const [topic, setTopic] = useState("bitcoin")
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState("")
  const [stats, setStats] = useState(loadStats())

  async function unlock() {
    setError(""); setReport(null); setLoading(true)
    try {
      const data = await buySignal(topic)
      if (data && data.report) {
        setReport(data.report as Report)
        const next = { calls: stats.calls + 1, usd: +(stats.usd + PRICE_USD).toFixed(2) }
        localStorage.setItem(EARN_KEY, JSON.stringify(next))
        setStats(next)
      } else {
        setError((data && data.error) || "Payment failed")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed")
    }
    setLoading(false)
  }

  return (
    <div style= margin: "0 32px 24px", border: "1px solid #c9a84c44", background: "#070604" >
      <div style= padding: "14px 20px", borderBottom: "1px solid #c9a84c22", display: "flex", justifyContent: "space-between", alignItems: "center" >
        <span style= color: "#c9a84c", fontSize: "11px", letterSpacing: "3px", fontFamily: "Cinzel, serif" >⬡ PREMIUM ORACLE · PAY-PER-CALL</span>
        <span style= color: "#c9a84c88", fontSize: "10px", fontFamily: "Cinzel, serif", letterSpacing: "2px" >{stats.calls} PAID · ${stats.usd.toFixed(2)} EARNED</span>
      </div>
      <div style= padding: "16px 20px" >
        <div style= display: "flex", gap: "8px", marginBottom: "12px" >
          <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Market topic..." style= flex: 1, padding: "10px 14px", background: "#050505", border: "1px solid #c9a84c33", color: "#d4c5a0", fontSize: "12px", fontFamily: "Cinzel, serif"  />
          <button onClick={unlock} disabled={loading || !isConnected} style= padding: "10px 18px", background: isConnected ? "#c9a84c" : "#1a1710", border: "none", color: isConnected ? "#060504" : "#555", fontFamily: "Cinzel, serif", fontSize: "11px", letterSpacing: "2px", fontWeight: 700, cursor: isConnected ? "pointer" : "not-allowed" >{loading ? "PAYING..." : "🔓 UNLOCK $0.02"}</button>
        </div>
        {!isConnected && <div style= color: "#c9a84c77", fontSize: "10px", letterSpacing: "2px" >CONNECT WALLET TO UNLOCK FULL REPORT</div>}
        {error && <div style= color: "#cf6679", fontSize: "11px", marginTop: "4px" >{error}</div>}
        {report && (
          <div style= marginTop: "12px" >
            <div style= color: "#d4c5a0", fontSize: "13px", lineHeight: 1.5, marginBottom: "12px", fontStyle: "italic" >{report.thesis}</div>
            {report.opportunities.map((o, i) => (
              <div key={i} style= padding: "12px", marginBottom: "10px", background: "rgba(201,168,76,0.04)", border: "1px solid #2a2416", borderLeft: "3px solid " + (o.recommendation === "YES" ? "#4caf7e" : "#cf6679") >
                <div style= display: "flex", justifyContent: "space-between", marginBottom: "6px" >
                  <span style= color: "#d4c5a0", fontSize: "12px", flex: 1, paddingRight: "10px" >{o.question}</span>
                  <span style= color: o.recommendation === "YES" ? "#4caf7e" : "#cf6679", fontWeight: "bold", fontSize: "14px" >{o.recommendation}</span>
                </div>
                <div style= display: "flex", gap: "16px" >
                  <span style= color: "#c9a84c", fontSize: "11px" >+EV: {o.expectedValue}%</span>
                  <span style= color: "#666", fontSize: "11px" >SIZE: {o.size} USDC</span>
                </div>
                <div style= color: "#555", fontSize: "11px", marginTop: "6px", fontStyle: "italic" >{o.reasoning}</div>
              </div>
            ))}
            <div style= color: "#c9a84c88", fontSize: "10px", letterSpacing: "1px" >⚠ {report.riskNote}</div>
          </div>
        )}
      </div>
    </div>
  )
}
