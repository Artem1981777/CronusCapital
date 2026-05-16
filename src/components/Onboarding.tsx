import { useState, useEffect } from "react"

export function Onboarding() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem("cronus_onboarded")
    if (!seen) setShow(true)
  }, [])

  function dismiss() {
    localStorage.setItem("cronus_onboarded", "1")
    setShow(false)
  }

  if (!show) return null

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.9)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px"
    }}>
      <div style={{
        background: "#050505", border: "1px solid #39ff14",
        maxWidth: "420px", width: "100%", padding: "32px",
        boxShadow: "0 0 40px #39ff1422"
      }}>
        <div style={{ fontFamily: "Cinzel, serif", fontSize: "20px", color: "#39ff14", letterSpacing: "4px", marginBottom: "8px", fontWeight: 900 }}>
          WELCOME TO THE AGORA
        </div>
        <div style={{ color: "#39ff1466", fontSize: "10px", letterSpacing: "3px", fontFamily: "Cinzel, serif", marginBottom: "24px" }}>
          AUTONOMOUS PREDICTION MARKET INTELLIGENCE
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "28px" }}>
          <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
            <span style={{ fontSize: "20px" }}>🔭</span>
            <div>
              <div style={{ color: "#39ff14", fontSize: "12px", fontFamily: "Cinzel, serif", letterSpacing: "2px", marginBottom: "3px" }}>SCOUT</div>
              <div style={{ color: "#39ff1477", fontSize: "11px", lineHeight: 1.5 }}>Fetches real prediction markets from Polymarket with live prices and volume</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
            <span style={{ fontSize: "20px" }}>⚖️</span>
            <div>
              <div style={{ color: "#39ff14", fontSize: "12px", fontFamily: "Cinzel, serif", letterSpacing: "2px", marginBottom: "3px" }}>ANALYST</div>
              <div style={{ color: "#39ff1477", fontSize: "11px", lineHeight: 1.5 }}>Applies Bayesian reasoning and Kelly criterion to find +EV opportunities</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
            <span style={{ fontSize: "20px" }}>⚡</span>
            <div>
              <div style={{ color: "#39ff14", fontSize: "12px", fontFamily: "Cinzel, serif", letterSpacing: "2px", marginBottom: "3px" }}>EXECUTOR</div>
              <div style={{ color: "#39ff1477", fontSize: "11px", lineHeight: 1.5 }}>Makes final decisions and logs them on Arc blockchain at ~$0.01 per TX</div>
            </div>
          </div>
        </div>

        <div style={{ background: "#39ff1411", border: "1px solid #39ff1433", padding: "12px", marginBottom: "24px" }}>
          <div style={{ color: "#39ff14", fontSize: "10px", letterSpacing: "2px", fontFamily: "Cinzel, serif", marginBottom: "6px" }}>HOW TO START</div>
          <div style={{ color: "#39ff1477", fontSize: "11px", lineHeight: 1.8 }}>
            1. Type a market topic or click a quick tag<br/>
            2. Hit CONSULT to activate the three oracles<br/>
            3. Connect wallet to log decisions on-chain<br/>
            4. Check Live Polymarket Feed for real markets
          </div>
        </div>

        <button onClick={dismiss} style={{
          width: "100%", padding: "14px",
          background: "#39ff14", border: "none",
          color: "#000", fontFamily: "Cinzel, serif",
          fontSize: "13px", letterSpacing: "3px",
          fontWeight: 900, cursor: "pointer"
        }}>ENTER THE AGORA</button>
      </div>
    </div>
  )
}
