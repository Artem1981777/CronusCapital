import { useEffect, useState } from "react"
import type { CSSProperties } from "react"

type Leg = {
  amountUsdc?: number | null
  payer?: string | null
  tx?: string | null
  explorer?: string | null
  verdict?: string | null
  to?: string | null
  amountAtomic?: string | null
}
type LoopResp = {
  ok: boolean
  updatedAt?: number
  honest_label?: string
  legs?: {
    buyer_seller?: Leg | null
    cogs?: Leg | null
    honesty?: { external_payers?: number; note?: string } | null
  }
}

const short = (h: string) => (h && h.length > 18 ? h.slice(0, 12) + "\u2026" + h.slice(-6) : h)

const S: Record<string, CSSProperties> = {
  wrap: { margin: "16px 0", padding: 16, border: "1px solid rgba(120,170,240,0.3)", borderRadius: 12, background: "rgba(18,22,32,0.6)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 },
  title: { fontSize: 14, fontWeight: 800, letterSpacing: 0.5, color: "#e6ecf5" },
  meta: { fontSize: 11, color: "#9ca3af" },
  step: { display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  num: { flex: "0 0 auto", width: 22, height: 22, borderRadius: 11, background: "rgba(120,170,240,0.15)", color: "#bcd2f7", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" },
  body: { flex: 1 },
  label: { fontSize: 12, fontWeight: 700, color: "#dbe4f0" },
  sub: { fontSize: 11, color: "#9ca3af", marginTop: 2, lineHeight: 1.5 },
  link: { fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#8ec3ff", textDecoration: "none" },
  badge: { display: "inline-block", fontSize: 10, padding: "2px 6px", borderRadius: 6, border: "1px solid rgba(120,170,240,0.4)", color: "#bcd2f7", marginLeft: 8 },
  ext: { fontSize: 11, color: "#39d98a", fontWeight: 700 },
  note: { fontSize: 11, color: "#9ca3af", lineHeight: 1.5, marginTop: 10 },
  err: { fontSize: 11, color: "#f0a0a0", marginTop: 8 },
  code: { fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#bcd2f7" }
}

export default function LoopPanel() {
  const [loop, setLoop] = useState<LoopResp | null>(null)
  const [err, setErr] = useState("")
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch("/api/agent-loop")
        const j = (await r.json()) as LoopResp
        if (alive) setLoop(j)
      } catch (e) { if (alive) setErr(String((e as Error).message || e)) }
    }
    load()
    const t = setInterval(load, 20000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const bs = loop?.legs?.buyer_seller || null
  const cg = loop?.legs?.cogs || null
  const ext = loop?.legs?.honesty?.external_payers
  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <div style={S.title}>Live agent-to-agent loop<span style={S.badge}>A2A</span></div>
        <div style={S.meta}>buyer &rarr; signal &rarr; upstream COGS &rarr; reputation</div>
      </div>

      <div style={S.step}>
        <div style={S.num}>1</div>
        <div style={S.body}>
          <div style={S.label}>Buyer pays &amp; seller serves (NANO, gas-free)</div>
          <div style={S.sub}>{bs ? ((bs.amountUsdc != null ? bs.amountUsdc + " USDC" : "paid") + (bs.verdict ? " \u00b7 verdict " + bs.verdict : "") + " \u00b7 Circle Gateway") : "no settlement recorded yet"}</div>
          {bs && bs.explorer && bs.tx ? <a style={S.link} href={bs.explorer} target="_blank" rel="noreferrer">{short(bs.tx)}</a> : null}
        </div>
      </div>

      <div style={S.step}>
        <div style={S.num}>2</div>
        <div style={S.body}>
          <div style={S.label}>Cronus pays upstream data (COGS)</div>
          <div style={S.sub}>{cg ? ((cg.amountUsdc != null ? cg.amountUsdc + " USDC" : (cg.amountAtomic || "")) + " \u00b7 self-operated demo (cost, not demand)") : "no COGS settlement recorded yet"}</div>
          {cg && cg.explorer && cg.tx ? <a style={S.link} href={cg.explorer} target="_blank" rel="noreferrer">{short(cg.tx)}</a> : null}
        </div>
      </div>

      <div style={S.step}>
        <div style={S.num}>3</div>
        <div style={S.body}>
          <div style={S.label}>Buyer writes ERC-8004 reputation</div>
          <div style={S.sub}>giveFeedback(sellerAgentId, score, jobRef, uri) &middot; identity-gated, de-duplicated per job</div>
        </div>
      </div>

      <div style={S.step}>
        <div style={S.num}>4</div>
        <div style={S.body}>
          <div style={S.label}>Honesty check</div>
          <div style={S.sub}>external_payers = <span style={S.ext}>{ext == null ? "0" : ext}</span> &middot; self-generated demo volume is labeled and never counted as demand</div>
        </div>
      </div>

      <div style={S.note}>Every leg is self-operated demo, shown to prove the full loop settles on Arc end-to-end. Reproduce: <span style={S.code}>node scripts/agent-loop.mjs</span></div>
      {err ? <div style={S.err}>{err}</div> : null}
    </div>
  )
}
