import { useState, useEffect } from "react"
import { usePublicClient } from "wagmi"
import { CRONUS_ABI, DEPLOYED_CONTRACT } from "../contracts"

interface OnChainDecision {
  oracle: string
  topic: string
  decision: string
  agentId: number
  timestamp: number
  confidence: number
  txIndex: number
}

export function Dashboard() {
  const [decisions, setDecisions] = useState<OnChainDecision[]>([])
  const [count, setCount] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const publicClient = usePublicClient()

  async function loadDecisions() {
    if (!publicClient) return
    setLoading(true)
    try {
      const total = await publicClient.readContract({
        address: DEPLOYED_CONTRACT as `0x${string}`,
        abi: CRONUS_ABI,
        functionName: "getDecisionsCount"
      }) as bigint
      setCount(Number(total))

      const logs = await publicClient.getContractEvents({
        address: DEPLOYED_CONTRACT as `0x${string}`,
        abi: CRONUS_ABI,
        eventName: "DecisionLogged",
        fromBlock: BigInt(0),
        toBlock: "latest"
      })

      const parsed = logs.slice(-10).reverse().map((log: any, i: number) => ({
        oracle: log.args.oracle || "",
        topic: log.args.topic || "",
        decision: log.args.decision || "",
        agentId: Number(log.args.agentId || 0),
        timestamp: Number(log.args.timestamp || 0) * 1000,
        confidence: 80,
        txIndex: i
      }))
      setDecisions(parsed)
    } catch (e) {
      console.log("Dashboard error:", e)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (open && publicClient) loadDecisions()
  }, [open, publicClient])

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
            fontSize: "9px", padding: "2px 8px", letterSpacing: "1px",
            fontFamily: "Cinzel, serif"
          }}>{count} TOTAL</span>
        </div>
        <span style={{ color: "#39ff1455", fontSize: "12px" }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ padding: "16px 20px" }}>
          {loading ? (
            <div style={{ color: "#39ff1455", fontSize: "11px", letterSpacing: "2px", fontFamily: "Cinzel, serif" }}>
              LOADING FROM ARC...
            </div>
          ) : decisions.length === 0 ? (
            <div style={{ color: "#39ff1433", fontSize: "11px", letterSpacing: "2px", fontFamily: "Cinzel, serif" }}>
              NO DECISIONS YET — CONNECT WALLET AND CONSULT
            </div>
          ) : (
            <>
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "12px", marginBottom: "20px"
              }}>
                <div style={{ padding: "12px", border: "1px solid #39ff1422", textAlign: "center" }}>
                  <div style={{ color: "#39ff14", fontSize: "20px", fontFamily: "Cinzel, serif", fontWeight: 700 }}>{count}</div>
                  <div style={{ color: "#39ff1455", fontSize: "9px", letterSpacing: "2px" }}>TOTAL DECISIONS</div>
                </div>
                <div style={{ padding: "12px", border: "1px solid #39ff1422", textAlign: "center" }}>
                  <div style={{ color: "#39ff14", fontSize: "20px", fontFamily: "Cinzel, serif", fontWeight: 700 }}>
                    {decisions.filter(d => d.decision.includes("EXECUTE")).length}
                  </div>
                  <div style={{ color: "#39ff1455", fontSize: "9px", letterSpacing: "2px" }}>EXECUTED</div>
                </div>
                <div style={{ padding: "12px", border: "1px solid #39ff1422", textAlign: "center" }}>
                  <div style={{ color: "#39ff14", fontSize: "20px", fontFamily: "Cinzel, serif", fontWeight: 700 }}>
                    {decisions.filter(d => d.decision.includes("HOLD")).length}
                  </div>
                  <div style={{ color: "#39ff1455", fontSize: "9px", letterSpacing: "2px" }}>HELD</div>
                </div>
              </div>

              <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                {decisions.map((d, i) => (
                  <div key={i} style={{
                    padding: "10px 14px", marginBottom: "8px",
                    border: "1px solid #39ff1422",
                    borderLeft: "2px solid " + (d.decision.includes("EXECUTE") ? "#39ff14" : "#39ff1455")
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ color: "#39ff14", fontSize: "9px", letterSpacing: "2px", fontFamily: "Cinzel, serif" }}>
                        {d.decision.includes("EXECUTE") ? "⚡ EXECUTE" : "⏸ HOLD"}
                      </span>
                      <span style={{ color: "#39ff1444", fontSize: "9px", fontFamily: "Courier New, monospace" }}>
                        {d.timestamp ? new Date(d.timestamp).toLocaleString() : "—"}
                      </span>
                    </div>
                    <div style={{ color: "#39ff14aa", fontSize: "11px", lineHeight: 1.4, marginBottom: "4px" }}>
                      {d.decision.slice(0, 100)}{d.decision.length > 100 ? "..." : ""}
                    </div>
                    <div style={{ color: "#39ff1444", fontSize: "9px", fontFamily: "Courier New, monospace" }}>
                      {d.oracle.slice(0, 10)}...{d.oracle.slice(-6)}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "12px", textAlign: "right" }}>
                <a
                  href={"https://testnet.arcscan.app/address/" + DEPLOYED_CONTRACT}
                  target="_blank"
                  style={{ color: "#39ff1466", fontSize: "10px", letterSpacing: "2px", fontFamily: "Cinzel, serif" }}
                >
                  VIEW ON ARCSCAN →
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
