import { useState, useEffect } from "react"
import { DEPLOYED_CONTRACT } from "../contracts"

interface LocalDecision {
  topic: string
  decision: string
  txHash: string
  timestamp: number
  agentId: number
}

const STORAGE_KEY = "cronus_decisions"

export function saveDecision(topic: string, decision: string, txHash: string) {
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
  existing.unshift({ topic, decision, txHash, timestamp: Date.now(), agentId: 3 })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.slice(0, 50)))
}

export function Dashboard({ totalOnChain }: { totalOnChain: number }) {
  const [decisions, setDecisions] = useState<LocalDecision[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
    setDecisions(stored)
  }, [open])

  const executed = decisions.filter(d => d.decision.includes("EXECUTE")).length
  const held = decisions.filter(d => d.decision.includes("HOLD")).length

  return (
    <div style={{ margin: "24px 32px 0", border: "1px solid #39ff1422", background: "#050505" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "14px 20px", display: "flex",
          justifyContent: "space-between", alignItems: "center",
          cursor: "pointer", borderBottom: open ? "1px solid #39ff1422" : "none"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ color: "#39ff14", fontSize: "11px", letterSpacing: "3px", fontFamily: "Cinzel, serif" }}>
            ⬡ ON-CHAIN DECISION HISTORY
          </span>
          <span style={{
            background: "#39ff1422", color: "#39ff14",
            fontSize: "9px", padding: "2px 8px", letterSpacing: "1px", fontFamily: "Cinzel, serif"
          }}>{totalOnChain} ON-CHAIN</span>
          <span style={{
            background: "#39ff1411", color: "#39ff1488",
            fontSize: "9px", padding: "2px 8px", letterSpacing: "1px", fontFamily: "Cinzel, serif"
          }}>{decisions.length} LOCAL</span>
        </div>
        <span style={{ color: "#39ff1455", fontSize: "12px" }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ padding: "16px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "20px" }}>
            <div style={{ padding: "12px", border: "1px solid #39ff1422", textAlign: "center" }}>
              <div style={{ color: "#39ff14", fontSize: "22px", fontFamily: "Cinzel, serif", fontWeight: 700 }}>{totalOnChain}</div>
              <div style={{ color: "#39ff1455", fontSize: "9px", letterSpacing: "2px" }}>ON-CHAIN TXS</div>
            </div>
            <div style={{ padding: "12px", border: "1px solid #39ff1422", textAlign: "center" }}>
              <div style={{ color: "#39ff14", fontSize: "22px", fontFamily: "Cinzel, serif", fontWeight: 700 }}>{executed}</div>
              <div style={{ color: "#39ff1455", fontSize: "9px", letterSpacing: "2px" }}>EXECUTED</div>
            </div>
            <div style={{ padding: "12px", border: "1px solid #39ff1422", textAlign: "center" }}>
              <div style={{ color: "#39ff14", fontSize: "22px", fontFamily: "Cinzel, serif", fontWeight: 700 }}>{held}</div>
              <div style={{ color: "#39ff1455", fontSize: "9px", letterSpacing: "2px" }}>HELD</div>
            </div>
          </div>

          {decisions.length === 0 ? (
            <div style={{ color: "#39ff1433", fontSize: "11px", letterSpacing: "2px", fontFamily: "Cinzel, serif" }}>
              NO LOCAL HISTORY YET — CONSULT THE ORACLES
            </div>
          ) : (
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              {decisions.map((d, i) => (
                <div key={i} style={{
                  padding: "10px 14px", marginBottom: "8px",
                  border: "1px solid #39ff1422",
                  borderLeft: "2px solid " + (d.decision.includes("EXECUTE") ? "#39ff14" : "#39ff1444")
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ color: "#39ff14", fontSize: "9px", letterSpacing: "2px", fontFamily: "Cinzel, serif" }}>
                      {d.decision.includes("EXECUTE") ? "⚡ EXECUTE" : "⏸ HOLD"}
                    </span>
                    <span style={{ color: "#39ff1444", fontSize: "9px" }}>
                      {new Date(d.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{ color: "#39ff14aa", fontSize: "11px", lineHeight: 1.4, marginBottom: "4px" }}>
                    {d.decision.slice(0, 120)}{d.decision.length > 120 ? "..." : ""}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#39ff1444", fontSize: "9px" }}>TOPIC: {d.topic}</span>
                    <a
                      href={"https://testnet.arcscan.app/tx/" + d.txHash}
                      target="_blank"
                      style={{ color: "#39ff1466", fontSize: "9px", letterSpacing: "1px" }}
                    >TX →</a>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: "12px", textAlign: "right" }}>
            <a
              href={"https://testnet.arcscan.app/address/" + DEPLOYED_CONTRACT}
              target="_blank"
              style={{ color: "#39ff1466", fontSize: "10px", letterSpacing: "2px", fontFamily: "Cinzel, serif" }}
            >VIEW CONTRACT ON ARCSCAN →</a>
          </div>
        </div>
      )}
    </div>
  )
}
