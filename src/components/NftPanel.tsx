// src/components/NftPanel.tsx — the NFT section: two tokens, one rule between them.
// Everything shown here is read from Arc by /api/nft at request time. The artwork is the
// SVG the contracts generate themselves, not an image we host.
import { useEffect, useState } from "react"

type Attr = { trait_type?: string; value?: string | number }
type Meta = { name?: string; description?: string; attributes?: Attr[] }
type TokenView = {
  tokenId: number
  status?: string
  owner?: string
  ownerExplorer?: string
  image?: string | null
  metadata?: Meta | null
  expiresAtIso?: string | null
  active?: boolean | null
}
type Contract = { label: string; address: string; explorer: string; verified: boolean | null; reason: string | null }
type Nft = {
  ok: boolean
  generatedAt: string
  certificate: {
    address: string
    explorer: string
    supply: number | null
    holder?: string
    guardian?: string
    operator?: string
    latest: TokenView | null
    rules: string[]
    limit: string
  }
  pass: {
    address: string
    explorer: string
    supply: number | null
    priceUsdc: number | null
    periodDays: number | null
    coverageCapPerPassUsdc: number | null
    poolUsdc: number | null
    backedPerPassUsdc: number | null
    breachedNow: boolean | null
    latest: TokenView | null
    rules: string[]
  }
  link: { certificateStatusSeenByPass: string | null; coverageLive: boolean | null; coverageReason: string | null; explanation: string }
  verification: { verified: number; total: number; unverified: number; unknown: number; note: string; contracts: Contract[] }
  unread: Array<{ call: string; reason: string }>
  complete: boolean
  honesty: string
}

const COLORS: Record<string, string> = {
  HOLDING: "#4ade80",
  ACTIVE: "#4ade80",
  CLAIMABLE: "#facc15",
  INCOMPLETE: "#94a3b8",
  EXPIRED: "#94a3b8",
  LAPSED: "#94a3b8",
  BREACHED: "#f87171",
  REVOKED: "#f87171",
  UNCOVERED: "#f87171",
}

const box: React.CSSProperties = {
  border: "1px solid #1e293b",
  borderRadius: 10,
  padding: 16,
  background: "#0b0d12",
}
const label: React.CSSProperties = { color: "#64748b", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }
const value: React.CSSProperties = { color: "#e2e8f0", fontSize: 20, fontFamily: "monospace" }
const small: React.CSSProperties = { color: "#94a3b8", fontSize: 12, lineHeight: 1.6 }

function num(v: number | null | undefined, suffix: string): string {
  if (v === null || v === undefined) return "unread"
  return v + suffix
}

function Token({ title, t, fallback }: { title: string; t: TokenView | null; fallback: string }) {
  if (!t) return <div style={box}><div style={label}>{title}</div><div style={small}>{fallback}</div></div>
  const st = t.status || (t.active === true ? "ACTIVE" : t.active === false ? "LAPSED" : "")
  return (
    <div style={box}>
      <div style={label}>{title}</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
        {t.image ? (
          <img src={t.image} alt={title} width={260} height={260} style={{ borderRadius: 8, border: "1px solid #1e293b" }} />
        ) : (
          <div style={{ ...small, width: 260 }}>the contract did not return an image</div>
        )}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ ...value, color: COLORS[st] || "#e2e8f0" }}>{st || "unknown"}</div>
          <div style={{ ...small, marginTop: 8 }}>token #{t.tokenId}</div>
          {t.owner ? (
            <div style={small}>
              held by{" "}
              <a href={t.ownerExplorer || "#"} target="_blank" rel="noreferrer" style={{ color: "#7dd3fc" }}>
                {t.owner.slice(0, 10)}...{t.owner.slice(-6)}
              </a>
            </div>
          ) : null}
          {t.expiresAtIso ? <div style={small}>expires {t.expiresAtIso.replace("T", " ").slice(0, 19)} UTC</div> : null}
          {t.metadata?.attributes?.length ? (
            <div style={{ marginTop: 10 }}>
              {t.metadata.attributes.slice(0, 8).map((a, i) => (
                <div key={i} style={small}>
                  <span style={{ color: "#64748b" }}>{a.trait_type}: </span>
                  {String(a.value)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function NftPanel() {
  const [data, setData] = useState<Nft | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/nft?cb=" + Date.now())
      .then((r) => r.json())
      .then((j) => { if (alive) { if (j && j.ok) setData(j); else setErr(String((j && j.error) || "resolver returned no data")) } })
      .catch((e) => { if (alive) setErr(String(e)) })
    return () => { alive = false }
  }, [])

  if (err) return <div style={{ ...box, color: "#f87171" }}>NFT state could not be read: {err}</div>
  if (!data) return <div style={{ ...box, ...small }}>reading both contracts off Arc...</div>

  const coverageColor = data.link.coverageLive === true ? "#4ade80" : data.link.coverageLive === false ? "#f87171" : "#94a3b8"

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={box}>
        <div style={label}>Proof tokens on Arc</div>
        <div style={{ ...small, marginTop: 8 }}>
          Two ERC-721 contracts that are not decoration. One records a fire drill and rots by itself a day later.
          The other sells API access and a parametric policy, and asks the first one whether that policy should pay
          at all. Both draw their own artwork on-chain, so what you see below survives this website.
        </div>
      </div>

      <Token title="Fire drill certificate (soulbound)" t={data.certificate.latest} fallback="no certificate has been minted yet" />

      <div style={box}>
        <div style={label}>What the certificate contract refuses to do</div>
        <ul style={{ ...small, marginTop: 8, paddingLeft: 18 }}>
          {data.certificate.rules.map((r, i) => <li key={i} style={{ marginBottom: 4 }}>{r}</li>)}
        </ul>
        <div style={{ ...small, marginTop: 10, color: "#facc15" }}>Known limit: {data.certificate.limit}</div>
        <div style={{ ...small, marginTop: 6 }}>
          <a href={data.certificate.explorer} target="_blank" rel="noreferrer" style={{ color: "#7dd3fc" }}>read the verified source</a>
        </div>
      </div>

      <Token title="Access pass and parametric policy" t={data.pass.latest} fallback="no pass has been bought yet" />

      <div style={box}>
        <div style={label}>Policy terms, read from the contract</div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 10 }}>
          <div><div style={label}>Price</div><div style={value}>{num(data.pass.priceUsdc, " USDC")}</div></div>
          <div><div style={label}>Period</div><div style={value}>{num(data.pass.periodDays, " days")}</div></div>
          <div><div style={label}>Pool</div><div style={value}>{num(data.pass.poolUsdc, " USDC")}</div></div>
          <div><div style={label}>Backed per pass</div><div style={value}>{num(data.pass.backedPerPassUsdc, " USDC")}</div></div>
          <div><div style={label}>Stated cap</div><div style={value}>{num(data.pass.coverageCapPerPassUsdc, " USDC")}</div></div>
        </div>
        <ul style={{ ...small, marginTop: 12, paddingLeft: 18 }}>
          {data.pass.rules.map((r, i) => <li key={i} style={{ marginBottom: 4 }}>{r}</li>)}
        </ul>
        <div style={{ ...small, marginTop: 6 }}>
          <a href={data.pass.explorer} target="_blank" rel="noreferrer" style={{ color: "#7dd3fc" }}>read the verified source</a>
        </div>
      </div>

      <div style={{ ...box, borderColor: coverageColor }}>
        <div style={label}>The leash: coverage follows the drills</div>
        <div style={{ ...value, color: coverageColor, marginTop: 6 }}>
          {data.link.coverageLive === true ? "COVERAGE LIVE" : data.link.coverageLive === false ? "COVERAGE SUSPENDED" : "UNREAD"}
        </div>
        <div style={{ ...small, marginTop: 8 }}>
          The pass reads the certificate as <b>{data.link.certificateStatusSeenByPass || "unread"}</b>. {data.link.coverageReason}
        </div>
        <div style={{ ...small, marginTop: 8 }}>{data.link.explanation}</div>
      </div>

      <div style={box}>
        <div style={label}>Contract verification, asked of the explorer just now</div>
        <div style={{ ...value, marginTop: 6 }}>
          {data.verification.verified} of {data.verification.total} verified
        </div>
        <div style={{ marginTop: 10 }}>
          {data.verification.contracts.map((c) => (
            <div key={c.address} style={{ ...small, marginBottom: 6 }}>
              <span style={{ color: c.verified === true ? "#4ade80" : c.verified === false ? "#f87171" : "#94a3b8" }}>
                {c.verified === true ? "verified" : c.verified === false ? "not verified" : "unknown"}
              </span>
              {" — "}
              <a href={c.explorer} target="_blank" rel="noreferrer" style={{ color: "#7dd3fc" }}>{c.label}</a>
              {c.verified === true ? null : <span style={{ color: "#64748b" }}> — {c.reason}</span>}
            </div>
          ))}
        </div>
        <div style={{ ...small, marginTop: 8, color: "#64748b" }}>{data.verification.note}</div>
      </div>

      <div style={box}>
        <div style={small}>{data.honesty}</div>
        {data.unread.length > 0 ? (
          <div style={{ ...small, marginTop: 6, color: "#facc15" }}>
            unread: {data.unread.map((u) => u.call).join(", ")}
          </div>
        ) : null}
        <div style={{ ...small, marginTop: 6, color: "#64748b" }}>
          generated {data.generatedAt.replace("T", " ").slice(0, 19)} UTC
        </div>
      </div>
    </div>
  )
}
