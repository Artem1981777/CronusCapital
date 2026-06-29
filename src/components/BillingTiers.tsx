import type { CSSProperties } from "react"

const wrapS: CSSProperties = { border: "1px solid #5eead433", borderRadius: 10, padding: "12px 14px", margin: "12px 0", background: "linear-gradient(180deg,#06141a,#04090c)" }
const titleS: CSSProperties = { fontWeight: 700, color: "#5eead4", fontSize: 14, marginBottom: 8 }
const rowS: CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: "1px solid #ffffff12" }
const tagS: CSSProperties = { color: "#a7f3d0", fontWeight: 700, fontSize: 12, minWidth: 104 }
const priceS: CSSProperties = { color: "#fbbf24", fontWeight: 700, fontSize: 13 }
const descS: CSSProperties = { color: "#9ca3af", fontSize: 11, flex: 1, textAlign: "right" }
const noteS: CSSProperties = { color: "#5eead4", fontSize: 10, marginTop: 8 }

const TIERS = [
	{ tag: "PER-CALL", price: "$0.001", desc: "One signal: GET /api/nano-signal" },
	{ tag: "PER-SECOND", price: "$0.00001/s", desc: "Streaming: buyer-agent --stream" },
	{ tag: "PER-DATASET", price: "$0.05", desc: "Bulk pull: /api/nano-signal?tier=dataset" },
]

export default function BillingTiers() {
	return (
		<section style={wrapS}>
			<div style={titleS}>{"\u26A1 Usage-based billing \u2014 three models, one Circle Gateway rail"}</div>
			{TIERS.map((t) => (
				<div key={t.tag} style={rowS}>
					<span style={tagS}>{t.tag}</span>
					<span style={priceS}>{t.price}</span>
					<span style={descS}>{t.desc}</span>
				</div>
			))}
			<div style={noteS}>All via @circle-fin/x402-batching: gas-free EIP-3009 authorizations, verified and served immediately, settled in Gateway batches.</div>
		</section>
	)
}
