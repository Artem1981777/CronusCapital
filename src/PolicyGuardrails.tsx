import { useEffect, useState, type CSSProperties } from "react"

const GOLD = "#c9a84c"
const GREEN = "#39e014"
const RED = "#e0563a"
const DIM = "#7e8c6a"

const wrap: CSSProperties = { maxWidth: 1100, margin: "24px auto", padding: "20px 24px", border: "1px solid rgba(201,168,76,0.35)", borderRadius: 10, background: "linear-gradient(180deg, rgba(15,18,12,0.85), rgba(8,10,7,0.9))", fontFamily: "Cinzel, serif" }
const head: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12 }
const title: CSSProperties = { color: GOLD, fontSize: 15, letterSpacing: 2, fontWeight: 700 }
const sub: CSSProperties = { color: DIM, fontSize: 10, letterSpacing: 1, marginTop: 4 }
const ruleRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 6, borderLeft: "2px solid rgba(201,168,76,0.4)", background: "rgba(201,168,76,0.03)" }
const ruleName: CSSProperties = { color: "#d4c5a0", fontSize: 12 }
const ruleMeta: CSSProperties = { color: DIM, fontSize: 10, marginTop: 2 }
const pass: CSSProperties = { color: GREEN, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }
const block: CSSProperties = { color: RED, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }
const badge = (ok: boolean): CSSProperties => ({ color: ok ? GREEN : RED, border: "1px solid " + (ok ? GREEN : RED), borderRadius: 4, padding: "5px 12px", fontSize: 11, letterSpacing: 2, fontWeight: 700, whiteSpace: "nowrap" })

function readNum(key: string, field: string): number {
	try {
		const r = localStorage.getItem(key)
		if (!r) return 0
		const o = JSON.parse(r)
		const v = o && o[field]
		return typeof v === "number" ? v : 0
	} catch {
		return 0
	}
}

export default function PolicyGuardrails() {
	const [spend, setSpend] = useState(0)
	useEffect(() => {
		const tick = () => setSpend(readNum("cronus.spend.v1", "usd"))
		tick()
		const id = setInterval(tick, 2000)
		return () => clearInterval(id)
	}, [])

	const DAILY_CAP = 5
	const spendOk = spend <= DAILY_CAP

	const rules = [
		{ name: "Conviction gate", meta: "min confidence 0.55 before execute", ok: true, val: "ENFORCED" },
		{ name: "Daily spend cap", meta: "$" + spend.toFixed(2) + " / $" + DAILY_CAP.toFixed(2), ok: spendOk, val: spendOk ? "PASS" : "BLOCK" },
		{ name: "Per-call price", meta: "x402 \u00b7 $0.02 fixed", ok: true, val: "ENFORCED" },
		{ name: "Asset coverage", meta: "signals: BTC \u00b7 ETH \u00b7 SOL \u00b7 ARB", ok: true, val: "CONFIGURED" },
		{ name: "Non-custodial", meta: "agent never holds user keys", ok: true, val: "PASS" },
	]
	const allOk = rules.every((r) => r.ok)

	return (
		<div style={wrap}>
			<div style={head}>
				<div>
					<div style={title}>{"\u{13289}"} GUARDRAIL POLICY ENGINE</div>
					<div style={sub}>ENFORCED {"\u00b7"} CHECKED BEFORE EVERY EXECUTE</div>
				</div>
				<div style={badge(allOk)}>{allOk ? "POLICY: PASS" : "POLICY: REVIEW"}</div>
			</div>
			{rules.map((r, i) => (
				<div key={i} style={ruleRow}>
					<div>
						<div style={ruleName}>{r.name}</div>
						<div style={ruleMeta}>{r.meta}</div>
					</div>
					<div style={r.ok ? pass : block}>{r.val}</div>
				</div>
			))}
		</div>
	)
}
