// src/components/SystemPanel.tsx — read-only system facts from the live agent manifest (additive, fail-open).
import { useEffect, useState, useCallback } from "react"

type Svc = { tier?: string; price?: { display?: string } }
type Reg = { address?: string; explorer?: string; agentId?: number }
type Manifest = {
  protocol?: string
  x402Version?: number
  paymentRails?: string[]
  network?: { name?: string; chainId?: number; symbol?: string; decimals?: number }
  identityRegistry?: Reg
  jobEscrow?: Reg
  reputationRegistry?: Reg
  services?: Svc[]
}

export function SystemPanel() {
  const [m, setM] = useState<Manifest | null>(null)
  const [err, setErr] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/manifest")
      if (!r.ok) throw new Error("bad status")
      const j = await r.json() as Manifest
      setM(j); setErr(false)
    } catch { setErr(true) }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async manifest fetch; state is set only after await
    load()
  }, [load])

  const row = (label: string, value: string) => (
    <div className="cd-sys-row"><span className="cd-sys-k">{label}</span><span className="cd-sys-v">{value}</span></div>
  )
  const reg = (label: string, r?: Reg) => (
    <div className="cd-sys-row">
      <span className="cd-sys-k">{label}</span>
      {r && r.address ? <a className="cd-sys-v cd-sys-link" href={r.explorer || ("https://testnet.arcscan.app/address/" + r.address)} target="_blank" rel="noreferrer">{r.address.slice(0, 6) + "…" + r.address.slice(-4)}</a> : <span className="cd-sys-v">n/a</span>}
    </div>
  )

  const std = (m && m.services && m.services.find(s => s.tier === "STANDARD")) || null
  const nano = (m && m.services && m.services.find(s => s.tier === "NANO")) || null

  return (
    <div className="cd-sys">
      <div className="cd-sys-head">
        <span className="cd-sys-title">◈ SYSTEM · MANIFEST</span>
        <a className="cd-sys-src" href="/api/manifest" target="_blank" rel="noreferrer">/api/manifest</a>
      </div>
      {err && !m ? (
        <div className="cd-sys-note">Manifest unavailable right now (n/a).</div>
      ) : !m ? (
        <div className="cd-sys-note">Loading…</div>
      ) : (
        <div className="cd-sys-grid">
          {row("Protocol", (m.protocol || "x402") + (m.x402Version ? " · v" + m.x402Version : ""))}
          {row("Network", (m.network && m.network.name ? m.network.name : "arc-testnet") + (m.network && m.network.chainId ? " · chain " + m.network.chainId : ""))}
          {row("Settlement asset", (m.network && m.network.symbol ? m.network.symbol : "USDC") + (m.network && m.network.decimals != null ? " · " + m.network.decimals + " dec" : ""))}
          {row("Payment rails", (m.paymentRails && m.paymentRails.length ? m.paymentRails.join(" · ") : "n/a"))}
          {reg("ERC-8004 identity" + (m.identityRegistry && m.identityRegistry.agentId != null ? " · #" + m.identityRegistry.agentId : ""), m.identityRegistry)}
          {reg("ERC-8183 escrow", m.jobEscrow)}
          {reg("ERC-8004 reputation", m.reputationRegistry)}
          {row("Services", (std && std.price && std.price.display ? "STANDARD " + std.price.display : "STANDARD 0.02 USDC") + " · " + (nano && nano.price && nano.price.display ? "NANO " + nano.price.display : "NANO 0.001 USDC"))}
        </div>
      )}
      <div className="cd-sys-foot">Read-only. Live values from the agent manifest; addresses link to the Arc testnet explorer.</div>
    </div>
  )
}
