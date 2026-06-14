import { DEPLOYED_CONTRACT } from "../contracts"

const ARC_CHAIN_ID = 5042002

function shorten(addr: string): string {
	if (!addr) return ""
	return addr.slice(0, 6) + "..." + addr.slice(-4)
}

export default function AgentIdentity() {
	const id = DEPLOYED_CONTRACT
	return (
		<div className="cd-aid">
			<span className="cd-aid-glyph">𓂀</span>
			<div className="cd-aid-main">
				<div className="cd-aid-name">CRONUS · AUTONOMOUS ON-CHAIN AGENT</div>
				<a className="cd-aid-id" href={"https://testnet.arcscan.app/address/" + id} target="_blank" rel="noreferrer">
					AGENT ID · {shorten(id)}
				</a>
			</div>
			<span className="cd-aid-net">Arc Testnet · {ARC_CHAIN_ID}</span>
			<span className="cd-aid-live">● LIVE</span>
		</div>
	)
}
