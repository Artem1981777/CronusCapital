import { useState } from "react"
import type { CSSProperties, ChangeEvent } from "react"

const STELLAR_EXPLORER = "https://stellar" + ".expert/explorer/testnet/tx/"
const BURN_KEY = "cronus_stellar_burn_tx"

const card: CSSProperties = { border: "1px solid #2a2a3a", borderRadius: "12px", padding: "16px", background: "#12121a", color: "#e8e8f0", marginTop: "16px", fontFamily: "Inter, system-ui, sans-serif" }
const title: CSSProperties = { fontSize: "13px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#a78bfa", marginBottom: "10px" }
const inp: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "8px", border: "1px solid #2a2a3a", background: "#0c0c12", color: "#e8e8f0", fontFamily: "monospace", fontSize: "12px" }
const btn: CSSProperties = { marginTop: "10px", width: "100%", padding: "11px 14px", borderRadius: "9px", border: "none", background: "#7c3aed", color: "#ffffff", fontWeight: 600, cursor: "pointer" }
const btnOff: CSSProperties = { marginTop: "10px", width: "100%", padding: "11px 14px", borderRadius: "9px", border: "none", background: "#3a3a4a", color: "#aaaaaa", fontWeight: 600, cursor: "not-allowed" }
const note: CSSProperties = { marginTop: "10px", fontSize: "12px", lineHeight: 1.5, color: "#c8c8d8" }
const lnk: CSSProperties = { color: "#a78bfa", wordBreak: "break-all" }

export default function StellarComplete() {
  const [tx, setTx] = useState(function () {
    try { return localStorage.getItem(BURN_KEY) || "" } catch { return "" }
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [link, setLink] = useState("")

  async function complete() {
    const h = tx.trim()
    if (!/^0x[0-9a-fA-F]{64}$/.test(h)) { setMsg("Enter a valid Arc burn tx hash (0x + 64 hex)."); return }
    setBusy(true); setLink(""); setMsg("Fetching Circle attestation and minting on Stellar... up to a minute.")
    try {
      const r = await fetch("/api/complete-stellar?txHash=" + h)
      const j = await r.json()
      if (j.status === "success") {
        setMsg("Done. USDC was minted and forwarded to your Stellar account.")
        setLink(STELLAR_EXPLORER + j.stellarTxHash)
      } else if (j.status === "pending") {
        setMsg("Circle attestation not ready yet (iris: " + (j.iris || "pending") + "). Wait about a minute and retry.")
      } else {
        setMsg("Failed: " + (j.status || "error") + (j.detail ? (" - " + j.detail) : ""))
      }
    } catch {
      setMsg("Network error, please retry.")
    }
    setBusy(false)
  }

  return (
    <div id="cap-stellar-complete" style={card}>
      <div style={title}>Complete on Stellar (Arc to Stellar)</div>
      <div style={note}>Paste your Arc BURN TX hash. We fetch Circle attestation and submit mint_and_forward on Stellar, so the USDC lands on your linked G-address. No wallet signature needed.</div>
      <input style={inp} value={tx} onChange={function (e: ChangeEvent<HTMLInputElement>) { setTx(e.target.value) }} placeholder="0x... Arc burn tx hash" />
      <button style={busy ? btnOff : btn} onClick={complete} disabled={busy}>{busy ? "Working..." : "Complete on Stellar"}</button>
      {msg ? <div style={note}>{msg}</div> : null}
      {link ? <div style={note}>Stellar tx: <a style={lnk} href={link} target="_blank" rel="noreferrer">{link}</a></div> : null}
    </div>
  )
}
