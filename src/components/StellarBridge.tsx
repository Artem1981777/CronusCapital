import { useEffect, useState } from "react"

const SCHEME = "https://"
const HORIZON = SCHEME + "horizon-testnet.stellar" + ".org"
const EXPLORER = SCHEME + "stellar" + ".expert/explorer/testnet"
const CCTP_DOC = SCHEME + "developers.circle" + ".com/cctp/quickstarts/transfer-usdc-stellar-arc"
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
const CCTP_DOMAIN = 27
const CRONUS_STELLAR = ""

type Ledger = { seq: number; closedAt: string } | null
type Asset = { numAccounts: number; amount: string } | null
type Bal = { balance: string } | null
type Pay = { id: string; amount: string; from: string; created: string }

const wrap: any = { maxWidth: 1100, margin: "40px auto", padding: "0 20px" }
const head: any = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }
const glyph: any = { fontSize: 22, color: "#39e014" }
const h2s: any = { margin: 0, color: "#eafff0" }
const badge: any = { color: "#39e014", border: "1px solid #39e01455", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontFamily: "monospace" }
const roadmap: any = { color: "#caa94a", border: "1px solid #caa94a55", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontFamily: "monospace" }
const intro: any = { color: "#9fb09f", lineHeight: 1.6, marginTop: 12 }
const errBox: any = { background: "#0a0f0a", border: "1px solid #cf667955", borderRadius: 12, padding: 20, margin: "12px 0", color: "#cf6679" }
const row: any = { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }
const card: any = { background: "#0a0f0a", border: "1px solid #39e01433", borderRadius: 12, padding: 20, margin: "12px 0" }
const note: any = { background: "#0a0f0a", border: "1px solid #39e01433", borderRadius: 12, padding: 20, margin: "12px 0", color: "#9fb09f" }
const tile: any = { background: "#0d140d", border: "1px solid #39e01422", borderRadius: 10, padding: "14px 16px", flex: "1 1 150px" }
const green: any = { color: "#39e014" }
const dim: any = { color: "#7a8a7a", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }
const val: any = { color: "#eafff0", fontSize: 20, fontFamily: "monospace", marginTop: 6 }
const link: any = { color: "#39e014", fontSize: 13, textDecoration: "none", marginRight: 16 }
const addr: any = { fontFamily: "monospace", color: "#39e014", wordBreak: "break-all", marginTop: 6 }
const balLine: any = { marginTop: 10, color: "#eafff0" }
const tableS: any = { width: "100%", marginTop: 12, borderCollapse: "collapse", fontFamily: "monospace", fontSize: 13 }
const theadRow: any = { color: "#7a8a7a", textAlign: "left" }
const trS: any = { borderTop: "1px solid #39e01422" }
const tdDim: any = { color: "#9fb09f", padding: "6px 0" }
const noPay: any = { color: "#7a8a7a", marginTop: 10 }
const links: any = { display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }

export function StellarBridge() {
  const [ledger, setLedger] = useState<Ledger>(null)
  const [asset, setAsset] = useState<Asset>(null)
  const [bal, setBal] = useState<Bal>(null)
  const [pays, setPays] = useState<Pay[]>([])
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const lr = await fetch(HORIZON + "/ledgers?order=desc&limit=1").then(r => r.json())
        const lrec = lr && lr._embedded && lr._embedded.records && lr._embedded.records[0]
        if (alive && lrec) setLedger({ seq: lrec.sequence, closedAt: lrec.closed_at })
        const ar = await fetch(HORIZON + "/assets?asset_code=USDC&asset_issuer=" + USDC_ISSUER).then(r => r.json())
        const arec = ar && ar._embedded && ar._embedded.records && ar._embedded.records[0]
        if (alive && arec) setAsset({ numAccounts: arec.num_accounts, amount: arec.amount })
        if (CRONUS_STELLAR) {
          try {
            const acc = await fetch(HORIZON + "/accounts/" + CRONUS_STELLAR).then(r => r.json())
            const u = acc && acc.balances && acc.balances.find((b: any) => b.asset_code === "USDC")
            if (alive && u) setBal({ balance: u.balance })
            const pr = await fetch(HORIZON + "/accounts/" + CRONUS_STELLAR + "/payments?order=desc&limit=5").then(r => r.json())
            const recs = (pr && pr._embedded && pr._embedded.records) || []
            if (alive) setPays(recs.filter((p: any) => p.type === "payment").map((p: any) => ({ id: p.id, amount: p.amount, from: p.from, created: p.created_at })))
          } catch { }
        }
      } catch {
        if (alive) setErr("Stellar testnet Horizon unreachable")
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  return (
    <section style={wrap}>
      <div style={head}>
        <span style={glyph}>{"\u2726"}</span>
        <h2 style={h2s}>Cross-chain reach: Stellar</h2>
        <span style={badge}>CCTP DOMAIN {CCTP_DOMAIN}</span>
        <span style={roadmap}>ROADMAP</span>
      </div>
      <p style={intro}>Cronus settles x402 payments natively on Arc. Circle CCTP (burn-and-mint) moves the same canonical USDC between Arc and Stellar testnet (domain {CCTP_DOMAIN}). Cross-chain signal funding from Stellar is on the Cronus roadmap; the metrics below are read live from Stellar testnet Horizon to verify the connection.</p>
      {err ? <div style={errBox}>{err}</div> : null}
      <div style={row}>
        <div style={tile}><div style={dim}>Stellar testnet</div><div style={val}>{loading ? "..." : (ledger ? "LIVE" : "n/a")}</div></div>
        <div style={tile}><div style={dim}>Latest ledger</div><div style={val}>{ledger ? "#" + ledger.seq : "..."}</div></div>
        <div style={tile}><div style={dim}>USDC trustlines</div><div style={val}>{asset ? Number(asset.numAccounts).toLocaleString() : "..."}</div></div>
        <div style={tile}><div style={dim}>USDC supply</div><div style={val}>{asset ? Number(asset.amount).toLocaleString() : "..."}</div></div>
      </div>
      {CRONUS_STELLAR ? (
        <div style={card}>
          <div style={dim}>Cronus Stellar account</div>
          <div style={addr}>{CRONUS_STELLAR}</div>
          <div style={balLine}>USDC balance: <b style={green}>{bal ? bal.balance : "0"}</b></div>
          {pays.length ? (
            <table style={tableS}>
              <thead><tr style={theadRow}><th>When</th><th>From</th><th>USDC</th></tr></thead>
              <tbody>{pays.map(p => (<tr key={p.id} style={trS}><td style={tdDim}>{new Date(p.created).toLocaleString()}</td><td style={tdDim}>{p.from.slice(0, 6) + "..." + p.from.slice(-4)}</td><td style={green}>{p.amount}</td></tr>))}</tbody>
            </table>
          ) : <div style={noPay}>No USDC payments yet.</div>}
          <a href={EXPLORER + "/account/" + CRONUS_STELLAR} target="_blank" rel="noreferrer" style={link}>View on Stellar Expert</a>
        </div>
      ) : (
        <div style={note}>Live Stellar testnet metrics above confirm the connection. Cross-chain settlement between Arc and Stellar uses Circle CCTP (burn-and-mint, domain {CCTP_DOMAIN}).</div>
      )}
      <div style={links}>
        <a href={EXPLORER + "/asset/USDC-" + USDC_ISSUER} target="_blank" rel="noreferrer" style={link}>USDC on Stellar testnet</a>
        <a href={CCTP_DOC} target="_blank" rel="noreferrer" style={link}>CCTP: Stellar and Arc</a>
      </div>
    </section>
  )
}
