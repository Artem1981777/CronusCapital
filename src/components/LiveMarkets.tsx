import { useState, useEffect } from "react"

interface Market {
  id: string
  question: string
  outcomePrices: string
  outcomes: string
  volumeNum: number
  liquidityNum: number
  endDateIso: string
}

export function LiveMarkets() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  async function fetchMarkets() {
    setLoading(true)
    try {
      const res = await fetch("/api/polymarket?endpoint=markets&active=true&limit=8&order=volume&ascending=false")
      const data = await res.json()
      if (Array.isArray(data)) {
        setMarkets(data.filter((m: Market) => m.volumeNum > 100))
        setLastUpdate(new Date())
      }
    } catch (e) { console.log("LiveMarkets error:", e) }
    setLoading(false)
  }

  useEffect(() => {
    if (open) {
      fetchMarkets()
      const interval = setInterval(fetchMarkets, 30000)
      return () => clearInterval(interval)
    }
  }, [open])

  function getPrice(m: Market): { yes: number, no: number } {
    try {
      const prices = JSON.parse(m.outcomePrices).map(Number)
      return { yes: prices[0], no: prices[1] }
    } catch { return { yes: 0.5, no: 0.5 } }
  }

  function getOutcomes(m: Market): string[] {
    try { return JSON.parse(m.outcomes) } catch { return ["YES", "NO"] }
  }

  function getDaysLeft(endDate: string): string {
    const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000)
    if (days < 0) return "ENDED"
    if (days === 0) return "TODAY"
    return days + "d left"
  }

  return (
    <div style={{ margin: "0 32px 24px", border: "1px solid #39ff1422", background: "#050505" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "14px 20px", display: "flex",
          justifyContent: "space-between", alignItems: "center",
          cursor: "pointer", borderBottom: open ? "1px solid #39ff1422" : "none"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#39ff14", boxShadow: "0 0 8px #39ff14", animation: "pulse 2s infinite" }} />
          <span style={{ color: "#39ff14", fontSize: "11px", letterSpacing: "3px", fontFamily: "Cinzel, serif" }}>
            LIVE POLYMARKET FEED
          </span>
          {markets.length > 0 && (
            <span style={{ background: "#39ff1422", color: "#39ff14", fontSize: "9px", padding: "2px 8px", letterSpacing: "1px", fontFamily: "Cinzel, serif" }}>
              {markets.length} ACTIVE
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {lastUpdate && (
            <span style={{ color: "#39ff1444", fontSize: "9px", fontFamily: "Courier New, monospace" }}>
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <span style={{ color: "#39ff1455" }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: "16px 20px" }}>
          {loading && markets.length === 0 ? (
            <div style={{ color: "#39ff1455", fontSize: "11px", letterSpacing: "2px", fontFamily: "Cinzel, serif" }}>
              FETCHING LIVE MARKETS...
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
              {markets.map((m, i) => {
                const price = getPrice(m)
                const outcomes = getOutcomes(m)
                const daysLeft = getDaysLeft(m.endDateIso)
                const isBullish = price.yes > 0.5
                return (
                  <div key={i} style={{
                    padding: "12px", border: "1px solid #39ff1422",
                    borderLeft: "2px solid " + (isBullish ? "#39ff14" : "#cf6679"),
                    background: "#030303"
                  }}>
                    <div style={{ color: "#39ff14aa", fontSize: "11px", lineHeight: 1.4, marginBottom: "8px", minHeight: "32px" }}>
                      {m.question.slice(0, 70)}{m.question.length > 70 ? "..." : ""}
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                      <div style={{
                        flex: 1, padding: "6px", textAlign: "center",
                        background: "#39ff1411", border: "1px solid #39ff1433"
                      }}>
                        <div style={{ color: "#39ff14", fontSize: "14px", fontWeight: 700, fontFamily: "Cinzel, serif" }}>
                          {Math.round(price.yes * 100)}%
                        </div>
                        <div style={{ color: "#39ff1466", fontSize: "9px", letterSpacing: "1px" }}>{outcomes[0] || "YES"}</div>
                      </div>
                      <div style={{
                        flex: 1, padding: "6px", textAlign: "center",
                        background: "#cf667911", border: "1px solid #cf667933"
                      }}>
                        <div style={{ color: "#cf6679", fontSize: "14px", fontWeight: 700, fontFamily: "Cinzel, serif" }}>
                          {Math.round(price.no * 100)}%
                        </div>
                        <div style={{ color: "#cf667966", fontSize: "9px", letterSpacing: "1px" }}>{outcomes[1] || "NO"}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#39ff1444", fontSize: "9px", fontFamily: "Courier New, monospace" }}>
                        VOL ${Math.round(m.volumeNum).toLocaleString()}
                      </span>
                      <span style={{ color: "#39ff1444", fontSize: "9px", fontFamily: "Courier New, monospace" }}>
                        LIQ ${Math.round(m.liquidityNum).toLocaleString()}
                      </span>
                      <span style={{ color: daysLeft === "TODAY" ? "#39ff14" : "#39ff1444", fontSize: "9px", fontFamily: "Courier New, monospace" }}>
                        {daysLeft}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ marginTop: "12px", textAlign: "center" }}>
            <button onClick={fetchMarkets} style={{
              padding: "6px 20px", background: "transparent",
              border: "1px solid #39ff1433", color: "#39ff1466",
              fontFamily: "Cinzel, serif", fontSize: "9px", letterSpacing: "2px", cursor: "pointer"
            }}>REFRESH</button>
          </div>
        </div>
      )}
    </div>
  )
}
