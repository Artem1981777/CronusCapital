import { useState, useEffect } from "react"

const SCHEME = "https://"
const HORIZON = SCHEME + "horizon-testnet.stellar" + ".org"
const EXPLORER = SCHEME + "stellar" + ".expert/explorer/testnet/account/"
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
const KEY = "cronus_stellar_addr"
const DASH = "\u2014"
const STAR = "\u2726"

function shorten(a: string) {
  if (!a) return ""
  return a.slice(0, 6) + "\u2026" + a.slice(-6)
}
function looksLikeAddr(a: string) {
  return /^G[A-Z2-7]{55}$/.test(a.trim())
}

export default function StellarWallet() {
  const [input, setInput] = useState("")
  const [addr, setAddr] = useState("")
  const [usdc, setUsdc] = useState<string | null>(null)
  const [xlm, setXlm] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)

  async function loadBalances(a: string) {
    setBusy(true)
    setStatus("")
    try {
      const r = await fetch(HORIZON + "/accounts/" + a)
      if (r.status === 404) {
        setStatus("Account not funded on testnet yet")
        setUsdc(null)
        setXlm(null)
        setBusy(false)
        return
      }
      const j = await r.json()
      const bals = Array.isArray(j.balances) ? j.balances : []
      let u: string | null = null
      let x: string | null = null
      for (const b of bals) {
        if (b.asset_type === "native") x = b.balance
        if (b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER) u = b.balance
      }
      setUsdc(u)
      setXlm(x)
      setStatus(u ? "" : "No USDC trustline on this account yet")
    } catch {
      setStatus("Could not reach Horizon")
    }
    setBusy(false)
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY) || ""
      if (saved) {
        setAddr(saved)
        loadBalances(saved)
      }
    } catch {}
  }, [])

  function connect() {
    const a = input.trim()
    if (!looksLikeAddr(a)) {
      setStatus("Enter a valid Stellar address starting with G")
      return
    }
    setAddr(a)
    try { window.localStorage.setItem(KEY, a) } catch {}
    loadBalances(a)
  }

  function disconnect() {
    setAddr("")
    setInput("")
    setUsdc(null)
    setXlm(null)
    setStatus("")
    try { window.localStorage.removeItem(KEY) } catch {}
  }

  const wrap: any = { border: "1px solid #39e01455", borderRadius: 14, padding: "18px 16px", margin: "18px 0", background: "rgba(5,12,5,.55)" }
  const head: any = { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }
  const title: any = { color: "#39e014", fontWeight: 800, fontSize: 18, letterSpacing: ".5px" }
  const inp: any = { width: "100%", boxSizing: "border-box", background: "#020802", color: "#d6ffd6", border: "1px solid #39e01455", borderRadius: 10, padding: "12px 12px", fontSize: 14, fontFamily: "monospace", marginBottom: 10 }
  const btn: any = { background: "#39e014", color: "#041006", border: "none", borderRadius: 10, padding: "12px 18px", fontWeight: 800, fontSize: 15, cursor: "pointer" }
  const ghost: any = { background: "transparent", color: "#39e014", border: "1px solid #39e01466", borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer" }
  const actions: any = { display: "flex", gap: 10, marginTop: 12 }
  const row: any = { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #39e01422", fontSize: 14 }
  const lbl: any = { color: "#7fd87f", letterSpacing: ".5px" }
  const val: any = { color: "#d6ffd6", fontFamily: "monospace" }
  const link: any = { color: "#39e014", textDecoration: "none", fontFamily: "monospace" }
  const note: any = { color: "#8aa98a", fontSize: 12, marginTop: 10, lineHeight: 1.5 }

  return (
    <div style={wrap}>
      <div style={head}>
        <span style={title}>{STAR} LINK STELLAR WALLET</span>
      </div>
      {!addr && (
        <div>
          <p style={note}>Paste your Lobstr testnet address (starts with G) to link your Stellar account and read live balances. This address is the mint recipient for Arc to Stellar bridging.</p>
          <input style={inp} value={input} onChange={(e) => setInput(e.target.value)} placeholder="G..." spellCheck={false} />
          <button style={btn} onClick={connect} disabled={busy}>{busy ? "Loading" + DASH : "Link Stellar Wallet"}</button>
        </div>
      )}
      {addr && (
        <div>
          <div style={row}><span style={lbl}>WALLET</span><a style={link} href={EXPLORER + addr} target="_blank" rel="noreferrer">{shorten(addr)}</a></div>
          <div style={row}><span style={lbl}>USDC BALANCE</span><span style={val}>{usdc === null ? DASH : usdc}</span></div>
          <div style={row}><span style={lbl}>XLM BALANCE</span><span style={val}>{xlm === null ? DASH : xlm}</span></div>
          <div style={actions}>
            <button style={ghost} onClick={() => loadBalances(addr)} disabled={busy}>Refresh</button>
            <button style={ghost} onClick={disconnect}>Disconnect</button>
          </div>
        </div>
      )}
      {status && <p style={note}>{status}</p>}
    </div>
  )
}
