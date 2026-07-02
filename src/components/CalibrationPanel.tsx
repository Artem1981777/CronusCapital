import { useEffect, useState } from "react"

type Bin = { range?: [number, number]; count?: number; mean_predicted?: number | null; empirical_accuracy?: number | null }
type BT = {
  ok?: boolean
  resolved_positions?: number
  brier?: number | null
  skill_score?: number | null
  calibration_bins?: Bin[]
}

const COIN_FLIP_BRIER = 0.25

function coinStyle(leftPct: number) { return { left: leftPct + "%" } }
function ptrStyle(leftPct: number, beats: boolean | null) { return { left: leftPct + "%", background: beats ? "#39e014" : "#e0563a" } }
function verdictStyle(beats: boolean | null) { return { color: beats ? "#39e014" : "#e0563a" } }
function pctStyle(w: number) { return { width: Math.max(0, Math.min(100, w)) + "%" } }

export function CalibrationPanel() {
  const [bt, setBt] = useState<BT | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const r = await fetch("/api/backtest")
        if (!r.ok) throw new Error("backtest")
        const j = (await r.json()) as BT
        if (alive) { setBt(j); setFailed(false); setLoading(false) }
      } catch { if (alive) { setFailed(true); setLoading(false) } }
    }
    load()
    const id = setInterval(load, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const bins = bt && Array.isArray(bt.calibration_bins) ? bt.calibration_bins : []
  const resolved = bt && bt.resolved_positions != null ? bt.resolved_positions : 0
  const brier = bt && bt.brier != null ? bt.brier : null
  const beatsCoin = brier != null ? brier < COIN_FLIP_BRIER : null
  const ptr = brier != null ? Math.max(0, Math.min(1, brier)) * 100 : null
  const coinPct = COIN_FLIP_BRIER * 100

  return (
    <div className="cd-cal">
      <div className="cd-cal-head">
        <span className="cd-cal-title">⬡ CALIBRATION · vs COIN-FLIP</span>
        <span className="cd-cal-src">live · /api/backtest{failed ? " · degraded" : ""}</span>
      </div>
      {loading && !bt ? (
        <div className="cd-cal-note">Loading…</div>
      ) : (
        <>
          <div className="cd-cal-scale">
            <div className="cd-cal-track">
              <div className="cd-cal-coin" style={coinStyle(coinPct)} />
              {ptr != null ? <div className="cd-cal-ptr" style={ptrStyle(ptr, beatsCoin)} /> : null}
            </div>
            <div className="cd-cal-scalelabels">
              <span>0.00 perfect</span>
              <span>0.25 coin-flip</span>
              <span>1.00 worst</span>
            </div>
          </div>
          <div className="cd-cal-verdict">
            Brier {brier != null ? brier.toFixed(3) : "n/a"} · coin-flip 0.250 ·{" "}
            <span style={verdictStyle(beatsCoin)}>{brier == null ? "n/a" : beatsCoin ? "BEATS COIN-FLIP" : "BELOW COIN-FLIP"}</span>
          </div>
          <div className="cd-cal-binhead">RELIABILITY BINS · predicted vs empirical</div>
          <div className="cd-cal-bins">
            {bins.map((b, i) => {
              const lo = b.range ? b.range[0] : 0
              const hi = b.range ? b.range[1] : 0
              const c = b.count != null ? b.count : 0
              const mp = b.mean_predicted
              const ea = b.empirical_accuracy
              return (
                <div className="cd-cal-bin" key={i}>
                  <span className="cd-cal-binrange">{lo.toFixed(1)}–{hi.toFixed(1)}</span>
                  <div className="cd-cal-bintrack">
                    {c > 0 && mp != null ? <div className="cd-cal-binpred" style={pctStyle(mp * 100)} /> : null}
                    {c > 0 && ea != null ? <div className="cd-cal-binemp" style={pctStyle(ea * 100)} /> : null}
                  </div>
                  <span className="cd-cal-bincount">{c > 0 ? "n=" + c : "—"}</span>
                </div>
              )
            })}
          </div>
          <div className="cd-cal-note">
            Honest: computed only over {resolved} on-chain-resolved position{resolved === 1 ? "" : "s"} — never backfilled. Gold = mean predicted conviction, green = empirical accuracy per bin. Small samples are not statistically meaningful yet; this fills as real stakes resolve.
          </div>
        </>
      )}
    </div>
  )
}
