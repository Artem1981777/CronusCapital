// CoverPanel.tsx — Cronus Cover: parametric price-drop micro-insurance (additive hackathon module).
// Quote -> buy (real USDC premium via wallet on Arc Testnet, or labeled demo) -> live policy feed with explorer links.
import { useEffect, useState } from "react"
import { useAccount, useWriteContract, usePublicClient, useSwitchChain, useChainId } from "wagmi"
import type { CSSProperties } from "react"

type Quote = { ok: boolean; market?: string; openPrice?: number; thresholdPct?: number; payoutUsdc?: number; premiumUsdc?: number; probEstimate?: number; error?: string }
type Policy = { id: string; market: string; rule: string; openPrice: number; payoutUsdc: number; premiumUsdc: number; status: string; demo: boolean; resolveBy: number; paymentTx?: string | null; payoutTx?: string | null }

const MARKETS = ["BTC-USDC", "ETH-USDC", "SOL-USDC", "BNB-USDC"]
const ARC_CHAIN_ID = 5042002
const EXPLORER_TX = "https://testnet.arcscan.app/tx/"
const USDC = "0x3600000000000000000000000000000000000000" as const
const TREASURY = "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd" as const
const ERC20_ABI = [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] }] as const
const gold = "#d4b26a"
const card: CSSProperties = { border: "1px solid rgba(212,178,106,0.35)", borderRadius: 12, padding: 16, background: "rgba(10,20,12,0.72)", marginBottom: 12 }
const btn: CSSProperties = { background: "transparent", border: "1px solid " + gold, color: gold, borderRadius: 8, padding: "8px 14px", cursor: "pointer", letterSpacing: 1 }
const inp: CSSProperties = { background: "rgba(0,0,0,0.4)", border: "1px solid rgba(212,178,106,0.35)", color: "#cfe8cf", borderRadius: 8, padding: "8px 10px" }
const txLink: CSSProperties = { color: "#7fd77f", textDecoration: "underline" }

export function CoverPanel() {
  const { address, isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const [market, setMarket] = useState("BTC-USDC")
  const [threshold, setThreshold] = useState("2")
  const [horizon, setHorizon] = useState(3600)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const [lastTx, setLastTx] = useState("")
  const [policies, setPolicies] = useState<Policy[]>([])

  async function loadPolicies() {
    try { const r = await fetch("/api/cover"); const j = await r.json(); setPolicies(Array.isArray(j.policies) ? j.policies : []) } catch { /* ignore */ }
  }
  useEffect(() => { loadPolicies(); const t = setInterval(loadPolicies, 15000); return () => clearInterval(t) }, [])

  async function getQuote() {
    setBusy(true); setNote(""); setLastTx(""); setQuote(null)
    try {
      const r = await fetch("/api/cover?action=quote&market=" + market + "&threshold=" + threshold + "&payout=0.05&horizon=" + horizon)
      setQuote(await r.json())
    } catch (e) { setNote(String(e)) }
    setBusy(false)
  }

  async function submitBuy(paymentTx?: string) {
    const headers: Record<string, string> = { "content-type": "application/json" }
    if (paymentTx) headers["X-PAYMENT"] = paymentTx
    const r = await fetch("/api/cover?action=buy", {
      method: "POST", headers,
      body: JSON.stringify({ buyer: address || "0x46213abeca58cc9a89a269fd25a8737c700ca164", market, thresholdPct: Number(threshold), payoutUsdc: 0.05, horizonSec: horizon }),
    })
    const j = await r.json()
    setNote(j.ok ? (paymentTx ? "✅ REAL policy opened · premium paid on-chain · " : "Policy opened (DEMO) · ") + "commitment " + String(j.policy?.commitment || "").slice(0, 18) + "…" : "Error: " + j.error)
    loadPolicies()
  }

  async function buyDemo() {
    if (!quote || !quote.ok) return
    setBusy(true); setNote(""); setLastTx("")
    try { await submitBuy() } catch (e) { setNote(String(e)) }
    setBusy(false)
  }

  async function buyReal() {
    if (!quote || !quote.ok || !quote.premiumUsdc) return
    if (!isConnected || !address) { setNote("Connect wallet first (top of page)"); return }
    setBusy(true); setLastTx("")
    try {
      if (chainId !== ARC_CHAIN_ID) {
        setNote("Switching wallet to Arc Testnet…")
        await switchChainAsync({ chainId: ARC_CHAIN_ID })
      }
      const amount = BigInt(Math.round(quote.premiumUsdc * 1.05 * 1e6)) // +5% buffer vs price drift
      setNote("Paying premium " + quote.premiumUsdc + " USDC to treasury on Arc Testnet…")
      const hash = await writeContractAsync({ chainId: ARC_CHAIN_ID, address: USDC, abi: ERC20_ABI, functionName: "transfer", args: [TREASURY, amount] })
      setLastTx(hash)
      setNote("Premium tx sent, waiting for confirmation…")
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash })
      setNote("Confirmed. Opening policy…")
      await submitBuy(hash)
      setLastTx(hash)
    } catch (e) { setNote("Payment failed: " + String((e as Error)?.message || e).slice(0, 140)) }
    setBusy(false)
  }

  return (
    <section id="cap-cover" style={{ padding: "24px 0" }}>
      <h2 style={{ color: gold, letterSpacing: 2 }}>🛡 CRONUS COVER <span style={{ fontSize: 12, border: "1px solid " + gold, borderRadius: 6, padding: "2px 6px", marginLeft: 8 }}>PARAMETRIC · NEW</span></h2>
      <p style={{ color: "#9fbf9f", maxWidth: 640 }}>
        Micro-insurance against price drops. The oracle prices the risk, the premium is paid in USDC (x402-style),
        the policy is committed on-chain (keccak256) BEFORE the outcome, and payouts are automatic at expiry — capped and verifiable.
      </p>
      <div style={card}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={market} onChange={(e) => setMarket(e.target.value)} style={inp}>
            {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <label style={{ color: "#9fbf9f" }}>drop ≥
            <input value={threshold} onChange={(e) => setThreshold(e.target.value)} style={{ ...inp, width: 56, margin: "0 6px" }} />%
          </label>
          <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} style={inp}>
            <option value={3600}>1 hour</option>
            <option value={86400}>24 hours</option>
          </select>
          <button style={btn} disabled={busy} onClick={getQuote}>{busy ? "…" : "GET QUOTE"}</button>
          {quote && quote.ok && <button style={{ ...btn, borderColor: "#7fd77f", color: "#7fd77f" }} disabled={busy} onClick={buyReal}>BUY · PAY USDC</button>}
          {quote && quote.ok && <button style={{ ...btn, opacity: 0.7 }} disabled={busy} onClick={buyDemo}>DEMO</button>}
        </div>
        {quote && quote.ok && (
          <div style={{ marginTop: 12, color: "#cfe8cf" }}>
            Open price <b>${quote.openPrice}</b> · payout <b>{quote.payoutUsdc} USDC</b> · premium <b style={{ color: gold }}>{quote.premiumUsdc} USDC</b> · est. prob {Math.round((quote.probEstimate || 0) * 100)}% · {horizon === 3600 ? "1h" : "24h"} horizon
          </div>
        )}
        {quote && !quote.ok && <div style={{ marginTop: 12, color: "#e08080" }}>{quote.error}</div>}
        {note && <div style={{ marginTop: 8, color: "#9fbf9f" }}>{note}</div>}
        {lastTx && (
          <div style={{ marginTop: 6 }}>
            <a style={txLink} href={EXPLORER_TX + lastTx} target="_blank" rel="noreferrer">View premium tx on ArcScan ↗</a>
          </div>
        )}
      </div>
      <div style={card}>
        <div style={{ color: gold, letterSpacing: 1, marginBottom: 8 }}>POLICY LEDGER ({policies.length})</div>
        {policies.length === 0 && <div style={{ color: "#9fbf9f" }}>No policies yet.</div>}
        {policies.slice(0, 8).map((p) => (
          <div key={p.id} style={{ display: "flex", gap: 10, flexWrap: "wrap", borderTop: "1px solid rgba(212,178,106,0.15)", padding: "6px 0", color: "#cfe8cf", fontSize: 13 }}>
            <span>{p.market}</span><span>{p.rule}</span><span>open ${p.openPrice}</span>
            <span>payout {p.payoutUsdc}</span><span>premium {p.premiumUsdc}</span>
            <span style={{ color: p.status === "PAID" ? "#7fd77f" : p.status === "OPEN" ? gold : "#9fbf9f" }}>{p.status}{p.demo ? " · DEMO" : " · REAL"}</span>
            {p.paymentTx && <a style={txLink} href={EXPLORER_TX + p.paymentTx} target="_blank" rel="noreferrer">premium tx ↗</a>}
            {p.payoutTx && <a style={txLink} href={EXPLORER_TX + p.payoutTx} target="_blank" rel="noreferrer">payout tx ↗</a>}
          </div>
        ))}
      </div>
    </section>
  )
}
