import { useState, type CSSProperties } from "react"
import { useAccount } from "wagmi"
import { usePaidSignal } from "../hooks/usePaidSignal"

const PRICE_USD = 0.02
const EARN_KEY = "cronus_earnings"

interface Opportunity { question: string; recommendation: "YES" | "NO"; expectedValue: number; size: number; reasoning: string }
interface Report { topic: string; thesis: string; opportunities: Opportunity[]; riskNote: string }

const wrap: CSSProperties = { margin: "0 32px 24px", border: "1px solid #c9a84c44", background: "#070604" }
const head: CSSProperties = { padding: "14px 20px", borderBottom: "1px solid #c9a84c22", display: "flex", justifyContent: "space-between", alignItems: "center" }
const headTitle: CSSProperties = { color: "#c9a84c", fontSize: "11px", letterSpacing: "3px", fontFamily: "Cinzel, serif" }
const headStat: CSSProperties = { color: "#c9a84c88", fontSize: "10px", fontFamily: "Cinzel, serif", letterSpacing: "2px" }
const body: CSSProperties = { padding: "16px 20px" }
const row: CSSProperties = { display: "flex", gap: "8px", marginBottom: "12px" }
const inputStyle: CSSProperties = { flex: 1, padding: "10px 14px", background: "#050505", border: "1px solid #c9a84c33", color: "#d4c5a0", fontSize: "12px", fontFamily: "Cinzel, serif" }
const hint: CSSProperties = { color: "#c9a84c77", fontSize: "10px", letterSpacing: "2px" }
const err: CSSProperties = { color: "#cf6679", fontSize: "11px", marginTop: "4px" }
const thesisStyle: CSSProperties = { color: "#d4c5a0", fontSize: "13px", lineHeight: 1.5, margin: "12px 0", fontStyle: "italic" }
const cardBase: CSSProperties = { padding: "12px", marginBottom: "10px", background: "rgba(201,168,76,0.04)", border: "1px solid #2a2416" }
const cardHead: CSSProperties = { display: "flex", justifyContent: "space-between", marginBottom: "6px" }
const qStyle: CSSProperties = { color: "#d4c5a0", fontSize: "12px", flex: 1, paddingRight: "10px" }
const metaRow: CSSProperties = { display: "flex", gap: "16px" }
const evStyle: CSSProperties = { color: "#c9a84c", fontSize: "11px" }
const sizeStyle: CSSProperties = { color: "#666", fontSize: "11px" }
const reasonStyle: CSSProperties = { color: "#555", fontSize: "11px", marginTop: "6px", fontStyle: "italic" }
const riskStyle: CSSProperties = { color: "#c9a84c88", fontSize: "10px", letterSpacing: "1px" }

function btnStyle(enabled: boolean): CSSProperties {
  return { padding: "10px 18px", background: enabled ? "#c9a84c" : "#1a1710", border: "none", color: enabled ? "#060504" : "#555", fontFamily: "Cinzel, serif", fontSize: "11px", letterSpacing: "2px", fontWeight: 700, cursor: enabled ? "pointer" : "not-allowed" }
}
function recStyle(yes: boolean): CSSProperties {
  return { color: yes ? "#4caf7e" : "#cf6679", fontWeight: "bold", fontSize: "14px" }
}
function cardStyle(yes: boolean): CSSProperties {
  return Object.assign({}, cardBase, { borderLeft: "3px solid " + (yes ? "#4caf7e" : "#cf6679") })
}

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
    <div style={wrap}>
      <div style={head}>
        <span style={headTitle}>PREMIUM ORACLE · PAY-PER-CALL</span>
        <span style={headStat}>{stats.calls + " PAID · $" + stats.usd.toFixed(2) + " EARNED"}</span>
      </div>
      <div style={body}>
        <div style={row}>
          <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Market topic..." style={inputStyle} />
          <button onClick={unlock} disabled={loading || !isConnected} style={btnStyle(isConnected)}>{loading ? "PAYING..." : "UNLOCK $0.02"}</button>
        </div>
        {!isConnected && <div style={hint}>CONNECT WALLET TO UNLOCK FULL REPORT</div>}
        {error && <div style={err}>{error}</div>}
        {report && (
          <div>
            <div style={thesisStyle}>{report.thesis}</div>
            {report.opportunities.map((o, i) => (
              <div key={i} style={cardStyle(o.recommendation === "YES")}>
                <div style={cardHead}>
                  <span style={qStyle}>{o.question}</span>
                  <span style={recStyle(o.recommendation === "YES")}>{o.recommendation}</span>
                </div>
                <div style={metaRow}>
                  <span style={evStyle}>{"+EV: " + o.expectedValue + "%"}</span>
                  <span style={sizeStyle}>{"SIZE: " + o.size + " USDC"}</span>
                </div>
                <div style={reasonStyle}>{o.reasoning}</div>
              </div>
            ))}
            <div style={riskStyle}>{"!! " + report.riskNote}</div>
          </div>
        )}
      </div>
    </div>
  )
}
