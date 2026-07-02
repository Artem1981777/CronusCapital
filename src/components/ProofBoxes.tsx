import { useEffect, useState, type MouseEvent } from "react"

type Ach = { id: string; glyph: string; title: string; desc: string; achieved: boolean; proofLabel: string; proofUrl: string }
type TR = { resolved_positions?: number; total_staked_usdc?: number; positions?: Array<{ resolveTxExplorer?: string; openTxExplorer?: string }> }
type SC = { external_payers?: number; sourceVerifiedContracts?: Array<{ sourceVerified?: { source?: string } }>; live?: { cogs?: { lastTxExplorer?: string } } }
type MET = { payments?: number; explorer?: string }

function stop(e: MouseEvent) { e.stopPropagation() }

export function ProofBoxes() {
  const [tr, setTr] = useState<TR | null>(null)
  const [sc, setSc] = useState<SC | null>(null)
  const [met, setMet] = useState<MET | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let alive = true
    async function load() {
      let failedAny = false
      try { const r = await fetch("/api/track-record"); if (!r.ok) throw new Error("tr"); const j = (await r.json()) as TR; if (alive) setTr(j) } catch { failedAny = true }
      try { const r = await fetch("/api/scorecard"); if (!r.ok) throw new Error("sc"); const j = (await r.json()) as SC; if (alive) setSc(j) } catch { failedAny = true }
      try { const r = await fetch("/api/metrics"); if (!r.ok) throw new Error("met"); const j = (await r.json()) as MET; if (alive) setMet(j) } catch { failedAny = true }
      if (alive) { setFailed(failedAny); setLoading(false) }
    }
    load()
    const id = setInterval(load, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const firstProof = tr && tr.positions && tr.positions.length ? (tr.positions[0].resolveTxExplorer || tr.positions[0].openTxExplorer || "") : ""
  const resolved = tr && tr.resolved_positions != null ? tr.resolved_positions : 0
  const staked = tr && tr.total_staked_usdc != null ? tr.total_staked_usdc : 0
  const contracts = sc && Array.isArray(sc.sourceVerifiedContracts) ? sc.sourceVerifiedContracts : []
  const sourcify0 = contracts.length && contracts[0].sourceVerified && contracts[0].sourceVerified.source ? contracts[0].sourceVerified.source : ""
  const cogsUrl = sc && sc.live && sc.live.cogs && sc.live.cogs.lastTxExplorer ? sc.live.cogs.lastTxExplorer : ""
  const payments = met && met.payments != null ? met.payments : 0
  const metUrl = met && met.explorer ? met.explorer : ""
  const extPayers = sc && sc.external_payers != null ? sc.external_payers : null

  const boxes: Ach[] = [
    { id: "stake", glyph: "◈", title: "SKIN IN THE GAME", desc: "The agent staked real USDC behind its own verdict, committed on-chain before the outcome was known.", achieved: staked > 0, proofLabel: "view stake tx", proofUrl: firstProof },
    { id: "resolved", glyph: "𓂀", title: "VERDICT RESOLVED", desc: "A pre-committed call was resolved verifiably on-chain — correct returns the stake, wrong slashes it to a burn address.", achieved: resolved > 0, proofLabel: "view resolution", proofUrl: firstProof },
    { id: "cogs", glyph: "⬡", title: "PAYS UPSTREAM", desc: "The agent autonomously paid a data provider in real USDC as its cost-of-goods (COGS), tracked separately from demand.", achieved: !!cogsUrl, proofLabel: "view COGS tx", proofUrl: cogsUrl },
    { id: "verified", glyph: "◆", title: "SOURCE-VERIFIED", desc: contracts.length + " contracts have exact-match verified source on Sourcify — no trust-me bytecode.", achieved: contracts.length > 0, proofLabel: "open sourcify", proofUrl: sourcify0 },
    { id: "settle", glyph: "◎", title: "x402 SETTLEMENTS", desc: payments + " x402 payments settled on-chain (self-generated test traffic, always labeled as such).", achieved: payments > 0, proofLabel: "view last tx", proofUrl: metUrl },
    { id: "honest", glyph: "▲", title: "HONEST BY DEFAULT", desc: "External payers are published openly and stay at " + (extPayers == null ? "n/a" : extPayers) + " until a real third party pays.", achieved: extPayers != null, proofLabel: "verify traction", proofUrl: "/api/traction" },
  ]

  const unsealed = boxes.filter(b => b.achieved).length
  function toggle(id: string) { setOpen(prev => { const n = { ...prev }; n[id] = !n[id]; return n }) }

  return (
    <div className="cd-box">
      <div className="cd-box-head">
        <span className="cd-box-title">𓂀 PROOF SEALS · {unsealed}/{boxes.length} UNSEALED</span>
        <span className="cd-box-src">live · track-record · scorecard · metrics{failed ? " · degraded" : ""}</span>
      </div>
      {loading && !tr && !sc && !met ? (
        <div className="cd-box-note">Loading…</div>
      ) : (
        <div className="cd-box-grid">
          {boxes.map(b => {
            const isOpen = !!open[b.id]
            const cls = b.achieved ? (isOpen ? "cd-box-c cd-box-open" : "cd-box-c cd-box-sealed") : "cd-box-c cd-box-locked"
            return (
              <div className={cls} key={b.id} onClick={() => { if (b.achieved) toggle(b.id) }}>
                <div className="cd-box-glyph">{b.achieved ? b.glyph : "◇"}</div>
                <div className="cd-box-name">{b.title}</div>
                {isOpen && b.achieved ? (
                  <>
                    <div className="cd-box-desc">{b.desc}</div>
                    {b.proofUrl ? <a className="cd-box-link" href={b.proofUrl} target="_blank" rel="noreferrer" onClick={stop}>{b.proofLabel} ↗</a> : <span className="cd-box-link">proof n/a</span>}
                  </>
                ) : (
                  <div className="cd-box-status">{b.achieved ? "TAP TO UNSEAL" : "SEALED"}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="cd-box-note">Each seal opens a real, on-chain-verifiable milestone the agent has actually achieved — no random prizes, no rewards for activity. The reward is the proof itself.</div>
    </div>
  )
}
