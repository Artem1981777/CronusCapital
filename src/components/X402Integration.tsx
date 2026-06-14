const ENDPOINT = "POST /api/signal"
const PRICE = "0.02 USDC"
const NETWORK = "arc-testnet"

const LINES = [
	"# 1 · client requests a premium signal",
	"curl -s https://cronus-capital.vercel.app/api/signal?m=BTC",
	"",
	"# 2 · Cronus replies 402 Payment Required (x402)",
	"HTTP 402 · price 0.02 USDC · network arc-testnet",
	"",
	"# 3 · client pays USDC + retries with X-PAYMENT header",
	"200 OK -> { verdict: EXECUTE, confidence: 0.95 }",
]

export default function X402Integration() {
	return (
		<div className="cd-x402">
			<div className="cd-x402-head">
				<span className="cd-x402-title">𓏏 INTEGRATE · PAY-PER-CALL (x402)</span>
				<span className="cd-x402-tag">RFB 02</span>
			</div>
			<div className="cd-x402-meta">
				<span>{ENDPOINT}</span>
				<span className="cd-x402-price">{PRICE}</span>
				<span>{NETWORK}</span>
			</div>
			<div className="cd-x402-code">
				{LINES.map((l, i) => (
					<div key={i} className={l.indexOf("#") === 0 ? "cd-x402-line cd-x402-cmt" : "cd-x402-line"}>{l}</div>
				))}
			</div>
			<div className="cd-x402-foot">Any agent or contract can pay Cronus per call. No login, no API key — just USDC on Arc.</div>
		</div>
	)
}
