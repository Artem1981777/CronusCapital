import type { CSSProperties } from "react"

type Rail = {
  std: string
  name: string
  how: string
  status: "LIVE" | "READY" | "ROADMAP"
}

const RAILS: Rail[] = [
  { std: "ERC-8183", name: "Job Escrow Settlement", how: "Every decision settles on Arc with a keccak jobHash commitment.", status: "LIVE" },
  { std: "x402", name: "Pay-per-call Payments", how: "Each oracle consult is metered at a fixed ~$0.02 fee.", status: "LIVE" },
  { std: "CCTP", name: "Cross-chain USDC", how: "Native Arc USDC on CCTP domain 7 - capital moves across chains.", status: "LIVE" },
  { std: "ERC-8004", name: "Agent Registries", how: "Identity (gromov7.eth), Reputation (Brier track record) and Validation (hash-chain ledger) are discovery-ready.", status: "READY" },
  { std: "ERC-4626", name: "Tokenized Capital Vault", how: "Deposit/withdraw interface so LPs can allocate into the agent.", status: "ROADMAP" },
]

const wrap: CSSProperties = { margin: "28px 0", padding: "20px", border: "1px solid #2a2a3a", borderRadius: "14px", background: "linear-gradient(180deg,#0d0d14,#0a0a10)" }
const head: CSSProperties = { fontSize: "13px", letterSpacing: "2px", color: "#e8c97a", fontWeight: 700, marginBottom: "4px" }
const sub: CSSProperties = { fontSize: "11px", color: "#8a8a9a", marginBottom: "16px" }
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "12px" }
const card: CSSProperties = { padding: "14px", border: "1px solid #23232f", borderRadius: "10px", background: "#101019" }
const stdRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }
const stdLabel: CSSProperties = { fontFamily: "monospace", fontSize: "12px", color: "#7aa2e8", fontWeight: 700 }
const nameStyle: CSSProperties = { fontSize: "13px", color: "#f0f0f5", fontWeight: 600, marginBottom: "6px" }
const howStyle: CSSProperties = { fontSize: "11px", color: "#9a9aa8", lineHeight: 1.5 }

function pill(status: Rail["status"]): CSSProperties {
  const c = status === "LIVE" ? { bg: "#10331f", fg: "#52e08a" } : status === "READY" ? { bg: "#12243f", fg: "#7aa2e8" } : { bg: "#2a2a33", fg: "#b0b0bc" }
  return { fontSize: "9px", letterSpacing: "1px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: c.bg, color: c.fg }
}

export default function ComposabilityStrip() {
  return (
    <div style={wrap}>
      <div style={head}>ECOSYSTEM COMPOSABILITY</div>
      <div style={sub}>How Cronus plugs into the Arc agent economy - open standards, not a walled garden.</div>
      <div style={grid}>
        {RAILS.map((r) => (
          <div key={r.std} style={card}>
            <div style={stdRow}>
              <span style={stdLabel}>{r.std}</span>
              <span style={pill(r.status)}>{r.status}</span>
            </div>
            <div style={nameStyle}>{r.name}</div>
            <div style={howStyle}>{r.how}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
