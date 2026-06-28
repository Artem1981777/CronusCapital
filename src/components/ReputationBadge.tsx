import { useEffect, useState } from "react"
import { createPublicClient, http } from "viem"
import { arcTestnet } from "../wagmiConfig"

const REPUTATION_ADDRESS = "0x2A19ad056EaE83364B0a6420685974cA219c209E"
const REP_ABI = [
	{
		inputs: [{ internalType: "uint256", name: "agentId", type: "uint256" }],
		name: "getReputation",
		outputs: [
			{ internalType: "uint256", name: "count", type: "uint256" },
			{ internalType: "uint256", name: "sum", type: "uint256" },
			{ internalType: "uint256", name: "avgX100", type: "uint256" },
		],
		stateMutability: "view",
		type: "function",
	},
] as const

const client = createPublicClient({ chain: arcTestnet, transport: http("/api/rpc") })

export default function ReputationBadge() {
	const [count, setCount] = useState<number | null>(null)
	const [avg, setAvg] = useState<string>("")
	useEffect(() => {
		let alive = true
		const load = async () => {
			try {
				const res = (await client.readContract({
					address: REPUTATION_ADDRESS,
					abi: REP_ABI,
					functionName: "getReputation",
					args: [1n],
				})) as readonly [bigint, bigint, bigint]
				if (!alive) return
				setCount(Number(res[0]))
				setAvg((Number(res[2]) / 100).toFixed(2))
			} catch {
				/* ignore read errors */
			}
		}
		load()
		const id = window.setInterval(load, 15000)
		return () => {
			alive = false
			window.clearInterval(id)
		}
	}, [])
	if (count === null) return null
	const label =
		"\u2B50 Reputation: " +
		count +
		" review" +
		(count === 1 ? "" : "s") +
		(count > 0 ? " \u00B7 avg " + avg + "/5" : "") +
		" (live on-chain)"
	return (
		<a
			className="cd-badge"
			href={"https://testnet.arcscan.app/address/" + REPUTATION_ADDRESS}
			target="_blank"
			rel="noreferrer"
			title="Live ERC-8004 on-chain reputation"
		>
			{label}
		</a>
	)
}
