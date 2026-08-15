import { useEffect, useState, type CSSProperties } from "react"

const EXPLORER = "https://testnet.arcscan.app"
const GREEN = "#39e014", GOLD = "#c9a84c", DIM = "#7e8c6a", RED = "#d4543a"
const short = (a: string) => (a && a.length > 10 ? a.slice(0, 6) + "\u2026" + a.slice(-4) : a)
const addr = (a: string) => `${EXPLORER}/address/${a}`
const txUrl = (h: string) => `${EXPLORER}/tx/${h}`

type ExtLeader = { payer: string; txs: number; usdc: number; firstTx?: string | null }
type SelfLeader = { payer: string; txs: number; usdc: number }
type LB = {
  ok?: boolean
  external_payers?: number; external_usdc?: number; external_leaders?: ExtLeader[]
  self_generated_wallets?: number; self_generated_txs?: number; self_generated_usdc?: number; self_generated_leaders?: SelfLeader[]
  treasury?: string; updatedAt?: string
}
type TR = { ok?: boolean; accuracy?: number; resolved_positions?: number }

const card: CSSProperties = { border: "1px solid #1a2a12", background: "#070b07", borderRadius: 10, padding: "14px 16px" }
const stat: CSSProperties = { flex: "1 1 140px", ...card }
const big = (c: string): CSSProperties => ({ fontSize: 26, fontWeight: 800, color: c, fontFamily: "Cinzel, serif" })
const lbl: CSSProperties = { fontSize: 11, letterSpacing: 2, color: DIM, textTransform: "uppercase", marginTop: 4 }
const th: CSSProperties = { textAlign: "left", fontSize: 11, letterSpacing: 1, color: DIM, padding: "6px 10px", borderBottom: "1px solid #1a2a12" }
const td: CSSProperties = { padding: "6px 10px", fontSize: 13, color: "#cfe8c4", borderBottom: "1px solid #10180c" }
const link: CSSProperties = { color: GREEN, textDecoration: "none" }

export default function LeaderboardPanel() {
  const [lb, setLb] = useState<LB | null>(null)
  const [tr, setTr] = useState<TR | null>(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const [l, t] = await Promise.all([
          fetch("/api/leaderboard?limit=25").then((r) => r.json() as Promise<LB>),
          fetch("/api/track-record").then((r) => r.json() as Promise<TR>).catch(() => ({} as TR)),
        ])
        if (!alive) return
        setLb(l); setTr(t); setErr("")
      } catch (e) {
        if (alive) setErr(String((e as Error).message || e))
      }
    }
    load()
    const id = setInterval(load, 20000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const ext = lb && Array.isArray(lb.external_leaders) ? lb.external_leaders : []
  const self = lb && Array.isArray(lb.self_generated_leaders) ? lb.self_generated_leaders : []
  const extPayers = Number(lb?.external_payers || 0)
  const acc = typeof tr?.accuracy === "number" ? tr.accuracy : null
  const accPct = acc == null ? "\u2014" : (acc <= 1 ? Math.round(acc * 100) : Math.round(acc)) + "%"
  const totalUsdc = Number(lb?.external_usdc || 0) + Number(lb?.self_generated_usdc || 0)

  return (
    <section className="cd2-section" data-sec="leaderboard">
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 22 }}>🏆</span>
        <h2 style={{ fontFamily: "Cinzel, serif", color: GREEN, margin: 0 }}>Arc Testnet Leaderboard</h2>
      </div>
      <p style={{ color: DIM, fontSize: 12, marginTop: 4 }}>
        Live agent-to-agent payments for Cronus signals on Arc testnet. Independently verifiable at{" "}
        <a style={link} href="/api/leaderboard" target="_blank" rel="noreferrer">/api/leaderboard</a>.
      </p>

      {err ? <div style={{ ...card, borderColor: RED, color: RED }}>fetch error: {err}</div> : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
        <div style={stat}><div style={big(extPayers > 0 ? GREEN : GOLD)}>{extPayers}</div><div style={lbl}>Verified external payers</div></div>
        <div style={stat}><div style={big(GREEN)}>{accPct}</div><div style={lbl}>Cronus signal accuracy</div></div>
        <div style={stat}><div style={big(GOLD)}>{totalUsdc.toFixed(3)}</div><div style={lbl}>Total on-chain USDC</div></div>
        <div style={stat}><div style={big(DIM)}>{Number(lb?.self_generated_wallets || 0)}</div><div style={lbl}>Self-gen test wallets</div></div>
      </div>

      <h3 style={{ color: GREEN, fontFamily: "Cinzel, serif", marginBottom: 6 }}>Verified external payers</h3>
      {ext.length === 0 ? (
        <div style={{ ...card, color: GOLD, fontSize: 13, lineHeight: 1.6 }}>
          No verified third-party payer yet. This table lists only wallets that are allow-listed <b>and</b> paid on-chain, confirmed in{" "}
          <a style={link} href="/api/receipts" target="_blank" rel="noreferrer">/api/receipts</a>. Our own test traffic is shown separately below and is never counted as external demand.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>#</th><th style={th}>Agent wallet</th><th style={th}>Txs</th><th style={th}>USDC</th><th style={th}>First tx</th></tr></thead>
          <tbody>{ext.map((r, i) => (
            <tr key={r.payer}><td style={td}>{i + 1}</td>
              <td style={td}><a style={link} href={addr(r.payer)} target="_blank" rel="noreferrer">{short(r.payer)}</a></td>
              <td style={td}>{r.txs}</td><td style={td}>{r.usdc.toFixed(3)}</td>
              <td style={td}>{r.firstTx ? <a style={link} href={txUrl(r.firstTx)} target="_blank" rel="noreferrer">view</a> : "\u2014"}</td>
            </tr>
          ))}</tbody>
        </table>
      )}

      <h3 style={{ color: GOLD, fontFamily: "Cinzel, serif", margin: "20px 0 6px" }}>Self-generated test traffic</h3>
      <p style={{ color: DIM, fontSize: 12, marginTop: 0 }}>Wallets we run to exercise the live x402 paywall. Labeled self-generated — never presented as external demand.</p>
      {self.length === 0 ? (
        <div style={{ ...card, color: DIM }}>No settlements yet.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>#</th><th style={th}>Wallet</th><th style={th}>Txs</th><th style={th}>USDC</th></tr></thead>
          <tbody>{self.map((r, i) => (
            <tr key={r.payer}><td style={td}>{i + 1}</td>
              <td style={td}><a style={link} href={addr(r.payer)} target="_blank" rel="noreferrer">{short(r.payer)}</a></td>
              <td style={td}>{r.txs}</td><td style={td}>{r.usdc.toFixed(3)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}

      <p style={{ color: DIM, fontSize: 11, marginTop: 14 }}>
        {lb?.updatedAt ? "Updated " + new Date(lb.updatedAt).toLocaleString() : ""} · treasury {lb?.treasury ? short(lb.treasury) : "\u2014"}
      </p>
    </section>
  )
}
