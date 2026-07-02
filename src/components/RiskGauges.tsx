// src/components/RiskGauges.tsx — read-only risk policy dials (real Executor limits; additive, no live-exposure fabrication).
const C = 2 * Math.PI * 34

function Ring({ value, max, unit, label, caption, color }: { value: number; max: number; unit: string; label: string; caption: string; color: string }) {
  const frac = Math.max(0, Math.min(1, value / max))
  const dash = (C * frac).toFixed(2) + " " + C.toFixed(2)
  return (
    <div className="cd-rg-cell">
      <svg viewBox="0 0 84 84" className="cd-rg-svg" role="img" aria-label={label + " " + value + unit}>
        <circle cx="42" cy="42" r="34" className="cd-rg-track" />
        <circle cx="42" cy="42" r="34" className="cd-rg-arc" stroke={color} strokeDasharray={dash} transform="rotate(-90 42 42)" />
        <text x="42" y="47" textAnchor="middle" className="cd-rg-num">{value}{unit}</text>
      </svg>
      <div className="cd-rg-label">{label}</div>
      <div className="cd-rg-cap">{caption}</div>
    </div>
  )
}

export function RiskGauges() {
  return (
    <div className="cd-riskgauges">
      <div className="cd-rg-head">
        <span className="cd-rg-title">◎ RISK LIMITS</span>
        <span className="cd-rg-src">policy limits · Executor agent · enforced before execute</span>
      </div>
      <div className="cd-rg-grid">
        <Ring value={5} max={25} unit="%" label="PER-POSITION CAP" caption="max bankroll per position" color="#39e014" />
        <Ring value={3} max={10} unit="%" label="MIN EDGE" caption="required edge to act" color="#c9a84c" />
        <Ring value={20} max={30} unit="%" label="DAILY LOSS LIMIT" caption="halt trading beyond" color="#e0563a" />
      </div>
      <div className="cd-rg-note">Static policy the Executor follows (max 5% bankroll per position, min edge 3%, daily loss limit 20%). Dials show configured limits, not live exposure.</div>
    </div>
  )
}
