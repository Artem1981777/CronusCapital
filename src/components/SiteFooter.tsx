export default function SiteFooter() {
	const cols = [
		{
			title: "VERIFIED SOURCE",
			glyph: "✓",
			items: [
				{ label: "Reputation — verified source", href: "https://repo.sourcify.dev/contracts/full_match/5042/0x7426bF7ec186F7E0fb57D3f9487fA94234D2C1Dd/" },
				{ label: "Identity registry — verified source", href: "https://repo.sourcify.dev/contracts/full_match/5042/0x5B179bFF284a17a5C8C3ccaDed1984949B410522/" },
				{ label: "Job escrow — verified source", href: "https://repo.sourcify.dev/contracts/full_match/5042/0x5C7f8f12D6aEcbA1A7461435F45f25b6c8Be18Ad/" },
				{ label: "Vault — verified source", href: "https://repo.sourcify.dev/contracts/full_match/5042/0x6104FC25E1B32B69F5c3Ef0DbBE4D7eC2821b0d3/" },
			],
		},
		{
			title: "PRODUCT",
			glyph: "⚡",
			items: [
				{ label: "Live app", href: "https://cronus-capital.vercel.app" },
				{ label: "Pay Cronus (x402 signal)", href: "https://cronus-capital.vercel.app/api/signal?topic=BTC" },
				{ label: "Live traction", href: "https://cronus-capital.vercel.app/api/traction" },
				{ label: "Leaderboard", href: "https://cronus-capital.vercel.app/api/leaderboard" },
			],
		},
		{
			title: "DEVELOPERS / API",
			glyph: "𓂀",
			items: [
				{ label: "Service manifest", href: "https://cronus-capital.vercel.app/api/manifest" },
				{ label: "OpenAPI / swagger", href: "https://cronus-capital.vercel.app/api/openapi" },
				{ label: "Public receipts (CSV)", href: "https://cronus-capital.vercel.app/api/receipts?format=csv" },
				{ label: "Live metrics", href: "https://cronus-capital.vercel.app/api/metrics" },
			],
		},
		{
			title: "ON-CHAIN PROOF",
			glyph: "𓊽",
			items: [
				{ label: "Paywall proof tx", href: "https://explorer.arc.io/tx/0xfe2764b2b837365ea7cb896fbbe55119ffbf250e51941945bf013a88bb942086" },
				{ label: "Reputation contract", href: "https://explorer.arc.io/address/0x7426bF7ec186F7E0fb57D3f9487fA94234D2C1Dd" },
				{ label: "Treasury wallet", href: "https://explorer.arc.io/address/0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd" },
				{ label: "Arc explorer", href: "https://explorer.arc.io" },
			],
		},
		{
			title: "BUILDERS",
			glyph: "𓏏",
			items: [
				{ label: "Source on GitHub", href: "https://github.com/Artem1981777/CronusCapital" },
				{ label: "Buyer-agent (A2A loop)", href: "https://github.com/Artem1981777/CronusCapital/blob/main/scripts/buyer-agent.mjs" },
				{ label: "Funding audit script", href: "https://github.com/Artem1981777/CronusCapital/blob/main/scripts/audit-funders.mjs" },
				{ label: "Verify live (no keys)", href: "https://github.com/Artem1981777/CronusCapital/blob/main/scripts/verify-live.mjs" },
			],
		},
	]
	return (
		<div className="cd-panel">
			<div className="cd-panel-title">𓂀 CRONUS — LINKS &amp; ON-CHAIN PROOF</div>
			<div className="cd-roadmap-grid">
				{cols.map((col) => (
					<div key={col.title} className="cd-rm">
						<div className="cd-rm-glyph">{col.glyph}</div>
						<div>
							<div className="cd-rm-t">{col.title}</div>
							<div className="cd-rm-d">
								{col.items.map((it) => (
									<span key={it.href}>
										<a className="cd-tx-link" href={it.href} target="_blank" rel="noreferrer">{it.label} ↗</a>
										<br />
									</span>
								))}
							</div>
						</div>
					</div>
				))}
			</div>
			<div className="cd-rm-note">Cronus Capital · autonomous on-chain payments on Arc · 2026 — Built on Arc × Circle. Every link is live; every metric is read on-chain.</div>
		</div>
	)
}
