import { useRef, useState, type CSSProperties } from "react"
import { useAccount, useConnect, useSwitchChain, useWriteContract, usePublicClient } from "wagmi"
import type { Address } from "viem"
import { createSession, streamPay, ARC, GATEWAY_DEPOSIT_ABI, ERC20_ALLOWANCE_APPROVE_ABI, type SessionKey, type StreamTick } from "../lib/session"

const CHAIN_ID = ARC.chainId
const EXPLORER = "https://testnet.arcscan.app"

const wrapS: CSSProperties = { border: "1px solid #8b5cf655", borderRadius: 10, padding: "14px 16px", margin: "12px 0", background: "linear-gradient(180deg,#0d0814,#050308)" }
const titleS: CSSProperties = { fontWeight: 800, color: "#c4b5fd", fontSize: 14, marginBottom: 6 }
const subS: CSSProperties = { color: "#9ca3af", fontSize: 11, lineHeight: 1.5, marginBottom: 10 }
const rowS: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "#e5e7eb", margin: "8px 0", alignItems: "center" }
const numS: CSSProperties = { fontWeight: 800, color: "#a78bfa" }
const inputS: CSSProperties = { width: 60, marginLeft: 6, background: "#0b0712", color: "#e5e7eb", border: "1px solid #8b5cf655", borderRadius: 6, padding: "2px 6px" }
const msgS: CSSProperties = { color: "#c4b5fd", fontSize: 11, marginTop: 8, lineHeight: 1.5 }
const noteS: CSSProperties = { color: "#fbbf24", fontSize: 10, marginTop: 8, lineHeight: 1.5 }
const linkS: CSSProperties = { color: "#c4b5fd", textDecoration: "underline" }
const feedS: CSSProperties = { maxHeight: 150, overflowY: "auto", marginTop: 8, fontSize: 11, fontFamily: "monospace" }
const tickS: CSSProperties = { padding: "2px 0", borderBottom: "1px solid #1f1730", wordBreak: "break-all" }
const btnRowS: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }

function btnS(disabled: boolean): CSSProperties {
  return { padding: "10px 16px", borderRadius: 8, border: "none", background: disabled ? "#241a3a" : "#8b5cf6", color: disabled ? "#c4b5fd" : "#0b0712", fontWeight: 800, fontSize: 12, letterSpacing: 1, cursor: disabled ? "not-allowed" : "pointer" }
}

const short = (a: string) => (a ? a.slice(0, 6) + "\u2026" + a.slice(-4) : "")
const atomic = (usd: number) => BigInt(Math.round(usd * 1e6))

export default function StreamSession() {
  const { address } = useAccount()
  const { connectAsync, connectors } = useConnect()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const [session, setSession] = useState<SessionKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [msg, setMsg] = useState("")
  const [ticks, setTicks] = useState<StreamTick[]>([])
  const [spent, setSpent] = useState(0)
  const [budget, setBudget] = useState("0.05")
  const [seconds, setSeconds] = useState("30")
  const stopRef = useRef(false)

  function newSession() {
    const s = createSession()
    setSession(s)
    setTicks([])
    setSpent(0)
    setMsg("Ephemeral session key created in memory (never stored). Fund it once, then stream with zero popups.")
  }

  async function fundAndStream() {
    if (!session) return
    setMsg("")
    setTicks([])
    setSpent(0)
    let ownerMaybe = address as Address | undefined
    if (!ownerMaybe) {
      const inj = connectors.find((c) => c.id === "injected") || connectors[0]
      if (!inj) { setMsg("No wallet detected. Install MetaMask, then try again."); return }
      try {
        const res = await connectAsync({ connector: inj, chainId: CHAIN_ID })
        ownerMaybe = res.accounts[0]
      } catch { setMsg("Wallet connection cancelled."); return }
    }
    if (!ownerMaybe) { setMsg("No wallet address available."); return }
    const owner: Address = ownerMaybe
    setBusy(true)
    try {
      try { await switchChainAsync({ chainId: CHAIN_ID }) } catch { /* ignore */ }
      const budgetUsd = Number(budget) || 0.05
      const secs = Math.max(1, Math.min(120, Number(seconds) || 30))
      const budgetAtomic = atomic(budgetUsd)
      const origin = window.location.origin
      let resource = origin + "/api/nano-signal"
      let perTick = 0.001
      try {
        const mr = await fetch(origin + "/api/manifest")
        const mf = await mr.json()
        const list = (mf && mf.services) || []
        const svc = list.find((x: { settlement?: string }) => x.settlement === "circle-gateway-batched") || list.find((x: { tier?: string }) => x.tier === "NANO")
        if (svc && svc.resource) resource = String(svc.resource).startsWith("http") ? String(svc.resource) : origin + String(svc.resource)
        if (svc && svc.price && svc.price.amount) perTick = Number(svc.price.amount) / 1e6
      } catch { /* ignore */ }
      if (publicClient) {
        const allowance = (await publicClient.readContract({ address: ARC.usdc, abi: ERC20_ALLOWANCE_APPROVE_ABI, functionName: "allowance", args: [owner, ARC.gatewayWallet] })) as bigint
        if (allowance < budgetAtomic) {
          setMsg("Approve USDC for the Gateway (one-time)...")
          const ah = await writeContractAsync({ chainId: CHAIN_ID, address: ARC.usdc, abi: ERC20_ALLOWANCE_APPROVE_ABI, functionName: "approve", args: [ARC.gatewayWallet, budgetAtomic] })
          try { await publicClient.waitForTransactionReceipt({ hash: ah }) } catch { /* ignore */ }
        }
      }
      setMsg("Fund the session key's Gateway balance (one on-chain deposit)...")
      const dh = await writeContractAsync({ chainId: CHAIN_ID, address: ARC.gatewayWallet, abi: GATEWAY_DEPOSIT_ABI, functionName: "depositFor", args: [ARC.usdc, session.address, budgetAtomic] })
      if (publicClient) { try { await publicClient.waitForTransactionReceipt({ hash: dh }) } catch { /* ignore */ } }
      setBusy(false)
      setStreaming(true)
      stopRef.current = false
      setMsg("Streaming popup-free nano-payments signed by the in-memory session key. No wallet prompts from here on.")
      const result = await streamPay({
        privateKey: session.privateKey,
        resource,
        seconds: secs,
        perTickUsd: perTick,
        budgetUsd,
        perTxCapUsd: perTick * 2,
        ttlMs: 10 * 60 * 1000,
        onTick: (t) => {
          setTicks((prev) => [...prev, t].slice(-60))
          if (t.ok) setSpent((s) => Number((s + t.amountUsd).toFixed(6)))
        },
        shouldStop: () => stopRef.current,
      })
      setStreaming(false)
      setMsg("Session ended (" + result.stoppedReason + "): " + result.attempted + " ticks, " + result.delivered + " signals, " + result.spentUsd + " USDC, " + result.settlements.length + " Gateway settlements \u2014 all popup-free after one deposit.")
    } catch (e) {
      const er = e as { shortMessage?: string; message?: string }
      setBusy(false)
      setStreaming(false)
      setMsg("Failed: " + String(er.shortMessage || er.message || e).slice(0, 140))
    }
  }

  return (
    <section style={wrapS}>
      <div style={titleS}>{"NANO A2A streaming \u2014 popup-free session key (Circle Gateway)"}</div>
      <div style={subS}>{"An ephemeral session key is generated in your browser and never stored. Your wallet funds its Gateway balance ONCE (depositFor); after that the session key signs gas-free EIP-3009 nano-payments per second with zero wallet popups. Hard budget, per-tx cap and TTL are enforced client-side."}</div>
      <div style={rowS}>
        <span>{"Budget"}<input style={inputS} value={budget} onChange={(e) => setBudget(e.target.value)} /> {"USDC"}</span>
        <span>{"Duration"}<input style={inputS} value={seconds} onChange={(e) => setSeconds(e.target.value)} /> {"s"}</span>
        <span>{"Spent "}<span style={numS}>{spent.toFixed(6)}</span> {"USDC"}</span>
        <span>{"Settlements "}<span style={numS}>{ticks.filter((t) => t.ok && t.settlement).length}</span></span>
      </div>
      {session ? <div style={subS}>{"Session key: "}<span style={numS}>{short(session.address)}</span>{" (in-memory only)"}</div> : null}
      <div style={btnRowS}>
        <button style={btnS(busy || streaming)} onClick={newSession} disabled={busy || streaming}>{"NEW SESSION"}</button>
        <button style={btnS(busy || streaming || !session)} onClick={fundAndStream} disabled={busy || streaming || !session}>{busy ? "FUNDING..." : (streaming ? "STREAMING..." : "FUND & STREAM")}</button>
        {streaming ? <button style={btnS(false)} onClick={() => { stopRef.current = true }}>{"STOP"}</button> : null}
      </div>
      {msg ? <div style={msgS}>{msg}</div> : null}
      {ticks.length ? (
        <div style={feedS}>
          {ticks.map((t) => (
            <div key={t.i} style={tickS}>
              {"[" + t.i + "] "}{t.ok ? (t.amountUsd.toFixed(6) + " USDC") : ("ERR " + (t.error || ""))}
              {t.verdict ? (" \u00b7 " + t.verdict) : ""}
              {t.settlement ? <a style={linkS} href={EXPLORER + "/tx/" + t.settlement} target="_blank" rel="noreferrer">{" \u00b7 settlement \u2197"}</a> : (t.ok ? " \u00b7 batched" : "")}
            </div>
          ))}
        </div>
      ) : null}
      <div style={noteS}>{"Honest: every tick is a real Circle Gateway nano-payment (EIP-3009, gas-free). Settlement ids resolving to an on-chain 0x hash link to arcscan; batched ids are labeled. Self-run demo traffic is labeled and never counted as external demand."}</div>
    </section>
  )
}
