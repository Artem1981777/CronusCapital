import { useEffect, useState } from "react"
import type { CSSProperties } from "react"

type DirectSettlement = { txHash: string; block: number; payer: string; amountUsdc: number; explorer: string }
type DirectRail = { rail: string; mapping: string; chainTip: number; windowBlocks: number; count: number; totalUsdc: number; settlements: DirectSettlement[] }
type GatewaySample = { txHash: string; to: string; amountUsdc: number; explorer: string }
type GatewayRail = { rail: string; mapping: string; note: string; chainTip: number; windowBlocks: number; gatewayWallet: string; onchainSettleTransfers: number; onchainBurns: number; topRecipients: Array<{ addr: string; count: number }>; samples: GatewaySample[] }
type SettlementsResp = { ok: boolean; resolver?: string; generatedAt?: string; treasury?: string; usdc?: string; rails?: { directOnchain?: DirectRail; gatewayBatched?: GatewayRail }; honesty?: string }

const EXPLORER = "https://testnet.arcscan.app"
const short = (a: string) => (a && a.length > 10 ? a.slice(0, 6) + "\u2026" + a.slice(-4) : a)

const S: Record<string, CSSProperties> = {
  wrap: { margin: "16px 0", padding: 16, border: "1px solid rgba(120,200,140,0.3)", borderRadius: 12, background: "rgba(20,28,24,0.6)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 },
  title: { fontSize: 14, fontWeight: 800, letterSpacing: 0.5, color: "#e6f5ec" },
  meta: { fontSize: 11, color: "#9ca3af" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 },
  card: { padding: 12, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, background: "rgba(255,255,255,0.02)" },
  label: { fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#9ca3af" },
  big: { fontSize: 22, fontWeight: 800, color: "#39d98a", marginTop: 2 },
  unit: { fontSize: 12, color: "#9ca3af", fontWeight: 500 },
  badge: { display: "inline-block", fontSize: 10, padding: "2px 6px", borderRadius: 6, border: "1px solid rgba(120,200,140,0.4)", color: "#bfe9cb", marginLeft: 8 },
  listWrap: { marginTop: 8 },
  row: { display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  link: { color: "#bfe9cb", textDecoration: "underline" },
  note: { fontSize: 11, color: "#9ca3af", lineHeight: 1.5, marginTop: 8 },
  flow: { fontSize: 12, color: "#cbd5e1", marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(90,120,255,0.08)", border: "1px solid rgba(120,140,255,0.25)" },
  empty: { fontSize: 12, color: "#9ca3af", marginTop: 8 },
  err: { fontSize: 11, color: "#f0a0a0", marginTop: 8 },
}

export default function GatewaySettlements() {
  const [data, setData] = useState<SettlementsResp | null>(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch("/api/settlements")
        const j = (await r.json()) as SettlementsResp
        if (!alive) return
        setData(j)
        setErr("")
      } catch (e) {
        if (alive) setErr(String((e as Error).message || e))
      }
    }
    load()
    const id = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const direct = data?.rails?.directOnchain || null
  const gw = data?.rails?.gatewayBatched || null
  const gen = data && data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : ""

  return (
    <section style={S.wrap}>
      <div style={S.head}>
        <span style={S.title}>Gateway settlements {"\u00b7"} on-chain proof</span>
        <span style={S.meta}>{data?.resolver || "cronus-gateway-settlement"}{gen ? " \u00b7 " + gen : ""}{direct ? " \u00b7 tip #" + direct.chainTip : ""}</span>
      </div>

      <div style={S.flow}>
        How Circle Gateway batching works: many gas-free EIP-3009 authorizations are netted by Circle Gateway and settled from the GatewayWallet in batches (N{"\u2192"}1) at scale. On current Arc-testnet volume each authorization still settles individually (1:1), so the batched footprint can read small or 0 {"\u2014"} it is labelled honestly and never fabricated.
      </div>

      <div style={S.grid}>
        <div style={S.card}>
          <div style={S.label}>Direct on-chain {"\u00b7"} x402-exact<span style={S.badge}>1:1 on-chain</span></div>
          <div style={S.big}>{direct ? direct.count : 0}<span style={S.unit}> settlements</span></div>
          <div style={S.meta}>{direct ? direct.totalUsdc.toFixed(6) : "0.000000"} USDC {"\u00b7"} verifiable on arcscan</div>
          {direct && direct.settlements.length > 0 ? (
            <div style={S.listWrap}>
              {direct.settlements.slice(0, 6).map((s) => (
                <div key={s.txHash} style={S.row}>
                  <span>{short(s.payer)}</span>
                  <span>{s.amountUsdc.toFixed(6)}</span>
                  <a style={S.link} href={s.explorer} target="_blank" rel="noreferrer">tx {"\u2197"}</a>
                </div>
              ))}
            </div>
          ) : (
            <div style={S.empty}>No direct settlements in window yet.</div>
          )}
        </div>

        <div style={S.card}>
          <div style={S.label}>Circle Gateway {"\u00b7"} batched footprint<span style={S.badge}>net-batched</span></div>
          <div style={S.big}>{gw ? gw.onchainSettleTransfers : 0}<span style={S.unit}> settle txs</span></div>
          <div style={S.meta}>{gw ? gw.onchainBurns : 0} burns {"\u00b7"} GatewayWallet footprint</div>
          {gw && gw.samples.length > 0 ? (
            <div style={S.listWrap}>
              {gw.samples.slice(0, 5).map((s) => (
                <div key={s.txHash} style={S.row}>
                  <span>{short(s.to)}</span>
                  <span>{s.amountUsdc.toFixed(6)}</span>
                  <a style={S.link} href={s.explorer} target="_blank" rel="noreferrer">tx {"\u2197"}</a>
                </div>
              ))}
            </div>
          ) : (
            <div style={S.empty}>No batched settlement txs in window (expected on testnet {"\u2014"} settles 1:1).</div>
          )}
          {gw ? (
            <div style={S.note}>
              <a style={S.link} href={EXPLORER + "/address/" + gw.gatewayWallet} target="_blank" rel="noreferrer">GatewayWallet on arcscan {"\u2197"}</a>
            </div>
          ) : null}
        </div>
      </div>

      {gw?.note ? <div style={S.note}>{gw.note}</div> : null}
      {data?.honesty ? <div style={S.note}>{data.honesty}</div> : null}
      {err ? <div style={S.err}>settlements unavailable: {err}</div> : null}
    </section>
  )
}
