import { useEffect, useState } from "react"
import type { CSSProperties } from "react"

type Invariant = { name: string; holds: boolean | null; detail: string }
type Gap = { gap: string; impact: string; severity: string; fix: string }
type Queued = { id: string; action: string; eta: number; etaIso: string; secondsRemaining: number; executable: boolean; queuedByMultisigTx: number }
type Timelock = { delaySeconds: number | null; queuedCount: number; queued: Queued[]; scanned: string; note?: string }
type PendingTx = { id: number; to: string; executed: boolean; confirmations: number | null; confirmationsNeeded: number | null; targetsGuard: boolean; selector: string }
type Guard = { address: string; explorer: string; owner: string | null; ownerIsMultisig: boolean | null; operator: string | null; guardian: string | null; recovery: string | null; perTxCapUsdc: number | null; dailyCapUsdc: number | null; hardPerTxCapUsdc: number | null; hardDailyCapUsdc: number | null; availableUsdc: number | null; paused: boolean | null; timelockDelaySeconds: number | null; note?: string }
type Multisig = { address: string; explorer: string; threshold: number | null; ownersCount: number | null; owners: string[]; txCount: number | null; pendingCount: number; pending: PendingTx[]; note?: string }
type GovResp = { ok: boolean; generatedAt?: string; guard?: Guard; multisig?: Multisig; invariants?: Invariant[]; knownGaps?: Gap[]; timelock?: Timelock; unread?: Array<{ field: string; reason: string }>; complete?: boolean; honesty?: string; cache?: { hit: boolean; stale: boolean; ageSeconds: number }; degraded?: { reason: string } }

const short = (a: string | null) => (a && a.length > 10 ? a.slice(0, 6) + "\u2026" + a.slice(-4) : a || "")

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
  row: { display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  val: { color: "#cbd5e1", fontVariantNumeric: "tabular-nums" },
  unread: { color: "#e0c060", fontSize: 11, fontStyle: "italic" },
  link: { color: "#bfe9cb", textDecoration: "underline" },
  note: { fontSize: 11, color: "#9ca3af", lineHeight: 1.5, marginTop: 8 },
  invRow: { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  gap: { marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(240,160,160,0.07)", border: "1px solid rgba(240,160,160,0.3)" },
  gapTitle: { fontSize: 12, fontWeight: 700, color: "#f0c0c0" },
  gapBody: { fontSize: 11, color: "#cbd5e1", lineHeight: 1.5, marginTop: 3 },
  fix: { fontSize: 11, color: "#bfe9cb", marginTop: 3 },
  err: { fontSize: 11, color: "#f0a0a0", marginTop: 8 },
	fixWrap: { marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(120,200,140,0.07)", border: "1px solid rgba(120,200,140,0.35)" },
}

function Val({ text }: { text: string | null }) {
  if (text === null) return <span style={S.unread}>not read from chain</span>
  return <span style={S.val}>{text}</span>
}

const holdColor = (h: boolean | null) => (h === true ? "#39d98a" : h === false ? "#f0a0a0" : "#e0c060")
const holdGlyph = (h: boolean | null) => (h === true ? "\u2713" : h === false ? "\u2717" : "?")

export default function GovernancePanel() {
  const [data, setData] = useState<GovResp | null>(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch("/api/governance")
        const j = (await r.json()) as GovResp
        if (!alive) return
        setData(j)
        setErr("")
      } catch (e) {
        if (alive) setErr(String((e as Error).message || e))
      }
    }
    load()
    const id = setInterval(load, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const g = data?.guard || null
  const ms = data?.multisig || null
  const inv = data?.invariants || []
  const gaps = data?.knownGaps || []
	const queued = data?.timelock?.queued || []
  const unread = data?.unread || []
  const failing = inv.filter((i) => i.holds === false).length
  const unknown = inv.filter((i) => i.holds === null).length
  const perTx = g && g.perTxCapUsdc !== null && g.hardPerTxCapUsdc !== null ? g.perTxCapUsdc + " of " + g.hardPerTxCapUsdc + " USDC" : null
  const daily = g && g.dailyCapUsdc !== null && g.hardDailyCapUsdc !== null ? g.dailyCapUsdc + " of " + g.hardDailyCapUsdc + " USDC" : null
  const timelock = g && g.timelockDelaySeconds !== null ? Math.round(g.timelockDelaySeconds / 3600) + "h (" + g.timelockDelaySeconds + "s)" : null
  const paused = g && g.paused !== null ? (g.paused ? "paused" : "live") : null
  const avail = g && g.availableUsdc !== null ? g.availableUsdc + " USDC" : null
  const thr = ms && ms.threshold !== null && ms.ownersCount !== null ? ms.threshold + " of " + ms.ownersCount : null
  const gen = data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : ""

  return (
    <section style={S.wrap}>
      <div style={S.head}>
        <span style={S.title}>Governance {"\u00b7"} who controls the controller</span>
        <span style={S.meta}>read live off Arc, no keys{gen ? " \u00b7 " + gen : ""}{data?.cache?.stale ? " \u00b7 stale " + data.cache.ageSeconds + "s" : ""}</span>
      </div>

      <div style={S.grid}>
        <div style={S.card}>
          <div style={S.label}>Owner of the agent guard</div>
          <div style={S.big}>{thr || "\u2014"}<span style={S.unit}> multisig</span></div>
          <div style={S.row}><span>guard</span>{g ? <a style={S.link} href={g.explorer} target="_blank" rel="noreferrer">{short(g.address)} {"\u2197"}</a> : <Val text={null} />}</div>
          <div style={S.row}><span>owner</span>{ms && g?.ownerIsMultisig ? <a style={S.link} href={ms.explorer} target="_blank" rel="noreferrer">{short(g.owner)} {"\u2197"}</a> : <Val text={g ? short(g.owner) : null} />}</div>
          <div style={S.row}><span>operator (hot)</span><Val text={g ? short(g.operator) : null} /></div>
          <div style={S.row}><span>guardian</span><Val text={g ? short(g.guardian) : null} /></div>
          <div style={S.row}><span>cold recovery</span><Val text={g ? short(g.recovery) : null} /></div>
          <div style={S.row}><span>multisig txs</span><Val text={ms && ms.txCount !== null ? ms.txCount + " total, " + ms.pendingCount + " pending" : null} /></div>
        </div>

        <div style={S.card}>
          <div style={S.label}>Limits on that power</div>
          <div style={S.big}>{timelock ? Math.round((g?.timelockDelaySeconds || 0) / 3600) + "h" : "\u2014"}<span style={S.unit}> timelock on every owner action</span></div>
          <div style={S.row}><span>per-tx cap</span><Val text={perTx} /></div>
          <div style={S.row}><span>daily cap</span><Val text={daily} /></div>
          <div style={S.row}><span>spendable now</span><Val text={avail} /></div>
          <div style={S.row}><span>state</span><Val text={paused} /></div>
          <div style={S.row}><span>timelock</span><Val text={timelock} /></div>
          <div style={S.note}>Hard ceilings and the cold recovery sink are immutable: set at deploy, unreachable by any owner. The owner can only lower the live caps, and only after the timelock.</div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={S.label}>Invariants {"\u00b7"} {inv.length} read from chain{failing ? " \u00b7 " + failing + " failing" : ""}{unknown ? " \u00b7 " + unknown + " unknown" : ""}</div>
        {inv.length === 0 ? <div style={S.note}>Governance state not loaded yet.</div> : inv.map((i) => (
          <div key={i.name} style={S.invRow}>
            <span style={{ color: holdColor(i.holds), fontWeight: 800 }}>{holdGlyph(i.holds)}</span>
            <span style={{ color: "#e6f5ec", flex: 1 }}>{i.name}</span>
            <span style={S.meta}>{i.detail}</span>
          </div>
        ))}
      </div>

      {gaps.map((x) => (
        <div key={x.gap} style={S.gap}>
          <div style={S.gapTitle}>Known gap [{x.severity}] {"\u00b7"} {x.gap}</div>
          <div style={S.gapBody}>{x.impact}</div>
          <div style={S.fix}>Fix: {x.fix}</div>
        </div>
      ))}

      {unread.length > 0 ? <div style={S.note}>{unread.length} value(s) could not be read from Arc and are shown as unread, never defaulted: {unread.map((u) => u.field).join(", ")}.</div> : null}
      {data?.degraded ? <div style={S.err}>Arc could not be read for this request ({data.degraded.reason}); showing the last successful read.</div> : null}
      {data?.honesty ? <div style={S.note}>{data.honesty}</div> : null}
      {queued.length > 0 ? (
        <div style={S.fixWrap}>
          <div style={S.gapTitle}>Fix in flight {"\u00b7"} {queued.length} rules change queued on-chain</div>
          {queued.map((q) => (
            <div key={q.id} style={S.gapBody}>
              {q.action} {"\u00b7"} executable at {q.etaIso} {"\u00b7"} {q.executable ? "timelock expired, awaiting execution" : Math.round(q.secondsRemaining / 3600) + "h left"} {"\u00b7"} queued by multisig tx #{q.queuedByMultisigTx}
            </div>
          ))}
          <div style={S.fix}>A queued change cannot execute before its stated time, and the guardian or the owner can still cancel it. The fix is on-chain and time-stamped, not a promise in prose.</div>
        </div>
      ) : null}
      <div style={S.note}>Reproduce without keys: <a style={S.link} href="/api/governance" target="_blank" rel="noreferrer">/api/governance {"\u2197"}</a> {"\u00b7"} asserted by 16 of the 149 checks in npm run verify-live.</div>
      {err ? <div style={S.err}>governance unavailable: {err}</div> : null}
    </section>
  )
}
