import { useEffect, useState } from "react"

type SVC = { name?: string; standard?: string; address?: string; explorer?: string; sourceVerified?: { provider?: string; match?: string; source?: string } }
type Claim = { claim?: string; verifiable?: boolean; how?: string }
type Scorecard = { sourceVerifiedContracts?: SVC[]; claims?: Claim[] }

function extractUrl(s?: string): string | null {
  if (!s) return null
  const m = s.match(/https?:\/\/[^\s)]+/)
  return m ? m[0] : null
}

export function ProofMatrix() {
  const [sc, setSc] = useState<Scorecard | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const r = await fetch("/api/scorecard")
        if (!r.ok) throw new Error("scorecard")
        const j = (await r.json()) as Scorecard
        if (alive) { setSc(j); setFailed(false); setLoading(false) }
      } catch { if (alive) { setFailed(true); setLoading(false) } }
    }
    load()
    const id = setInterval(load, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const contracts = sc && Array.isArray(sc.sourceVerifiedContracts) ? sc.sourceVerifiedContracts : []
  const claims = sc && Array.isArray(sc.claims) ? sc.claims : []

  return (
    <div className="cd-pm">
      <div className="cd-pm-head">
        <span className="cd-pm-title">◆ CLAIM → PROOF</span>
        <span className="cd-pm-src">live · /api/scorecard{failed ? " · degraded" : ""}</span>
      </div>
      {loading && !sc ? (
        <div className="cd-pm-note">Loading…</div>
      ) : (contracts.length === 0 && claims.length === 0) ? (
        <div className="cd-pm-note">Scorecard unavailable right now (n/a).</div>
      ) : (
        <>
          <div className="cd-pm-sub">SOURCE-VERIFIED CONTRACTS</div>
          <div className="cd-pm-contracts">
            {contracts.map((c, i) => (
              <div className="cd-pm-c" key={c.address || i}>
                <div className="cd-pm-c-top">
                  <span className="cd-pm-c-name">{c.name || "contract"}</span>
                  {c.sourceVerified && c.sourceVerified.match ? <span className="cd-pm-c-badge">{c.sourceVerified.match.replace("_", " ")}</span> : null}
                </div>
                <div className="cd-pm-c-std">{c.standard || ""}</div>
                <div className="cd-pm-c-links">
                  {c.explorer ? <a href={c.explorer} target="_blank" rel="noreferrer">explorer ↗</a> : null}
                  {c.sourceVerified && c.sourceVerified.source ? <a href={c.sourceVerified.source} target="_blank" rel="noreferrer">sourcify ↗</a> : null}
                </div>
              </div>
            ))}
          </div>
          <div className="cd-pm-sub">VERIFIABLE CLAIMS</div>
          <div className="cd-pm-claims">
            {claims.map((cl, i) => {
              const url = extractUrl(cl.how)
              return (
                <div className="cd-pm-claim" key={i}>
                  <span className="cd-pm-mark">{cl.verifiable ? "✓" : "•"}</span>
                  <div className="cd-pm-body">
                    <div className="cd-pm-text">{cl.claim || ""}</div>
                    <div className="cd-pm-how">{cl.how || ""}{url ? " " : ""}{url ? <a href={url} target="_blank" rel="noreferrer">verify ↗</a> : null}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
      <div className="cd-pm-note">Every claim is independently reproducible with zero private keys — we report how to verify, never a self-asserted "passed".</div>
    </div>
  )
}
