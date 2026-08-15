import { useEffect, useState } from "react"
import type { CSSProperties } from "react"

const EXPLORER = "https://testnet.arcscan.app"

type Service = { tier?: string; resource?: string; price?: { amount?: string; asset?: string }; payTo?: string; network?: string; settlement?: string }
type Manifest = { name?: string; description?: string; services?: Service[] }
type Client = { client: string; calls: number; lastTs?: number | null; tiers?: string[]; kind?: string }
type Payer = { payer: string; usdc: number; txs?: number; calls?: number }
type LeaderResp = { ok?: boolean; recent_clients?: Client[]; self_generated_leaders?: Payer[]; unique_external_payers?: number; external_payers?: number; self_demo_calls?: number; headline_note?: string }
type Card = { card?: { identity?: { agentId?: number | string; feedbacks?: number | null; avgRating?: number | null } } }

const COMPATIBLE = [
  { name: "Claude", note: "MCP-native (Desktop / API)" },
  { name: "ChatGPT / OpenAI", note: "function-calling + MCP" },
  { name: "LangChain", note: "MCP tool adapter" },
  { name: "Cursor", note: "MCP client" },
  { name: "Cline", note: "MCP client" },
]

const FLOW = [
  { k: "1", t: "Discover", d: "GET /api/manifest — machine-readable x402 storefront" },
  { k: "2", t: "Pay", d: "x402 / EIP-3009 gas-free via Circle Gateway" },
  { k: "3", t: "Consume", d: "signal delivered with EIP-191 receipt" },
  { k: "4", t: "Reputation", d: "ERC-8004 feedback written on-chain" },
]

export default function A2APanel() {
  const [m, setM] = useState<Manifest | null>(null)
  const [lb, setLb] = useState<LeaderResp | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const [mr, lr, cr] = await Promise.all([
          fetch("/api/manifest").then((r) => r.json() as Promise<Manifest>),
          fetch("/api/leaderboard?limit=25").then((r) => r.json() as Promise<LeaderResp>),
          fetch("/api/nano-signal?card=1").then((r) => r.json() as Promise<Card>).catch(() => null),
        ])
        if (!alive) return
        setM(mr); setLb(lr); setCard(cr); setErr("")
      } catch (e) {
        if (alive) setErr(String((e as Error).message || e))
      }
    }
    load()
    const id = setInterval(load, 20000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const services = (m && Array.isArray(m.services)) ? m.services : []
  const clients = (lb && Array.isArray(lb.recent_clients)) ? lb.recent_clients : []
  const payers = (lb && Array.isArray(lb.self_generated_leaders)) ? lb.self_generated_leaders : []
  const rep = card && card.card && card.card.identity ? card.card.identity : null
  const extPayers = Number((lb && lb.external_payers) || 0)

  const box: CSSProperties = { margin: "10px 0", padding: "12px 14px", border: "1px solid rgba(120,160,220,0.30)", borderRadius: 10, background: "rgba(30,45,80,0.18)" }
  const label: CSSProperties = { fontSize: 11, letterSpacing: 0.4, color: "#9ca3af" }
  const chip: CSSProperties = { padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }
  const tag = (c: string): CSSProperties => ({ display: "inline-block", fontSize: 10, padding: "1px 7px", borderRadius: 999, marginLeft: 8, border: "1px solid " + c, color: c })

  return (
    <section className="cd-nano">
      <div className="cd-nano-head">
        <span className="cd-card-label">A2A MARKETPLACE · MCP + x402</span>
        <span className="cd-nano-tag">autonomous · no human in the loop</span>
      </div>

      <div className="cd-nano-hero">
        <div className="cd-nano-hero-num">{services.length > 0 ? services.length : "—"}</div>
        <div className="cd-nano-hero-sub">
          live services any AI agent can discover and pay for — published as <code>npx cronus-mcp</code> (npm v0.2.0)
        </div>
      </div>

      {err ? <div style={{ color: "#e06c6c", fontSize: 12 }}>load error: {err}</div> : null}

      <div style={box}>
        <div style={label}>LIVE SERVICES · /api/manifest</div>
        <div className="cd-nano-grid" style={{ marginTop: 8 }}>
          {services.length === 0 ? <div style={{ color: "#9ca3af", fontSize: 12 }}>loading manifest…</div> :
            services.map((s, i) => (
              <div className="cd-card-glow" key={i}>
                <div className="cd-card-label">{s.tier || "SERVICE"}</div>
                <div className="cd-card-value">{s.price && s.price.amount ? s.price.amount : "?"} {s.price && s.price.asset ? s.price.asset : "USDC"}</div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>{s.settlement || s.network || ""}</div>
              </div>
            ))}
        </div>
      </div>

      <div style={box}>
        <div style={label}>AUTONOMOUS A2A LOOP</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {FLOW.map((f) => (
            <div key={f.k} style={{ flex: "1 1 150px", padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#bcd0f5" }}>{f.k}. {f.t}</div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>{f.d}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={box}>
        <div style={label}>MCP-COMPATIBLE CLIENTS · CAN DISCOVER AND PAY</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {COMPATIBLE.map((c) => (
            <div key={c.name} style={chip}>
              <span style={{ fontWeight: 700, color: "#e5e7eb", fontSize: 13 }}>{c.name}</span>
              <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 6 }}>{c.note}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "#7c8698", marginTop: 8 }}>
          Honest label: these speak MCP and can autonomously pay Cronus. Presence here is protocol compatibility, not a claim that each has already paid.
        </div>
      </div>

      <div style={box}>
        <div style={label}>LIVE INTERACTIONS · REAL CLIENT NAMES (FROM PAID CALLS)</div>
        {clients.length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 6 }}>No client-tagged calls recorded yet. Real callers appear here by client name the moment they pay.</div>
        ) : (
          <ol style={{ marginTop: 8, paddingLeft: 18 }}>
            {clients.map((c, i) => (
              <li key={i} style={{ fontSize: 12, color: "#dbe4f3", margin: "3px 0" }}>
                <span style={{ fontWeight: 600 }}>{c.client}</span>
                <span style={tag(c.kind === "self-demo" ? "#c9a84c" : "#39d98a")}>{c.kind === "self-demo" ? "self / demo" : "external client"}</span>
                <span style={{ color: "#9ca3af", marginLeft: 8 }}>{c.calls} call{c.calls === 1 ? "" : "s"}{c.tiers && c.tiers.length ? " · " + c.tiers.join(", ") : ""}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div style={box}>
        <div style={label}>ON-CHAIN PROOF</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 8, fontSize: 12, color: "#dbe4f3" }}>
          <div>Verified external payers: <b style={{ color: extPayers > 0 ? "#39d98a" : "#c9a84c" }}>{extPayers}</b></div>
          <div>Autonomous test wallets: <b>{payers.length}</b></div>
          {rep ? <div>Seller reputation (ERC-8004): <b>{rep.avgRating != null ? Number(rep.avgRating).toFixed(2) : "—"}/5</b>{rep.feedbacks != null ? " (" + rep.feedbacks + " feedbacks)" : ""}</div> : null}
        </div>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <a style={{ color: "#bfe9cb", marginRight: 14 }} href="/api/manifest" target="_blank" rel="noreferrer">manifest ↗</a>
          <a style={{ color: "#bfe9cb", marginRight: 14 }} href="https://github.com/Artem1981777/CronusCapital/blob/main/scripts/buyer-agent.mjs" target="_blank" rel="noreferrer">buyer-agent source ↗</a>
          <a style={{ color: "#bfe9cb" }} href={EXPLORER} target="_blank" rel="noreferrer">Arc explorer ↗</a>
        </div>
        {lb && lb.headline_note ? <div style={{ fontSize: 10, color: "#7c8698", marginTop: 8 }}>{lb.headline_note}</div> : null}
      </div>
    </section>
  )
}
