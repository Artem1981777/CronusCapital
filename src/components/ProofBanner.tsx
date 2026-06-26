import type { CSSProperties } from "react"

const ARC_BURN = "0x8df20b0e4d3e46b7fd04336bec44080516d97ef5348b575823a3cd6ca9faf172"
const STELLAR_MINT = "b9baf4efea289c49e12e09aa12c6c02d70b6613c2be80b3db7398385a76805d4"
const ARCSCAN_TX = "https://testnet.arcscan" + ".app/tx/"
const STELLAR_EXPLORER = "https://stellar" + ".expert/explorer/testnet/tx/"

const wrap: CSSProperties = { border: "1px solid #2a2a3a", borderRadius: "14px", padding: "18px", background: "#120e1d", color: "#e8e8f0", marginTop: "16px", fontFamily: "Inter, system-ui, sans-serif" }
const kicker: CSSProperties = { fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#a78bfa", marginBottom: "8px" }
const head: CSSProperties = { fontSize: "20px", fontWeight: 700, lineHeight: 1.25, margin: 0 }
const sub: CSSProperties = { marginTop: "8px", fontSize: "13px", lineHeight: 1.5, color: "#c8c8d8" }
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }
const chip: CSSProperties = { padding: "7px 11px", borderRadius: "999px", border: "1px solid #34d39955", background: "#0c1a14", color: "#34d399", fontSize: "12px", fontWeight: 600, textDecoration: "none" }
const chipP: CSSProperties = { padding: "7px 11px", borderRadius: "999px", border: "1px solid #a78bfa55", background: "#160f22", color: "#c4b5fd", fontSize: "12px", fontWeight: 600, textDecoration: "none" }

export default function ProofBanner() {
  return (
    <div id="cap-proof-banner" style={wrap}>
      <div style={kicker}>Autonomous agent economy on Arc</div>
      <h2 style={head}>Earns USDC via x402, settles canonical USDC across chains via Circle CCTP.</h2>
      <div style={sub}>Fully real on testnet. No wrapped assets, no custodial bridge. Every claim is one click from an on-chain proof. Verified Arc to Stellar transfer: balance landed 0 to 1.0000 USDC.</div>
      <div style={row}>
        <a style={chip} href={ARCSCAN_TX + ARC_BURN} target="_blank" rel="noreferrer">Arc burn (verified)</a>
        <a style={chipP} href={STELLAR_EXPLORER + STELLAR_MINT} target="_blank" rel="noreferrer">Stellar mint (verified)</a>
      </div>
    </div>
  )
}
