import { useState, type CSSProperties } from "react"
import { useAccount, useConnect, useSwitchChain, useWriteContract, usePublicClient } from "wagmi"

const ARC_CHAIN_ID = 5042002
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const
const PAY_TO = "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd" as const
const ERC20_ABI = [
	{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const

const wrapS: CSSProperties = { border: "1px solid #5eead455", borderRadius: 10, padding: "14px 16px", margin: "12px 0", background: "linear-gradient(180deg,#04141a,#020a0d)" }
const titleS: CSSProperties = { fontWeight: 800, color: "#5eead4", fontSize: 14, marginBottom: 6 }
const subS: CSSProperties = { color: "#9ca3af", fontSize: 11, lineHeight: 1.5, marginBottom: 10 }
const linkS: CSSProperties = { color: "#5eead4", textDecoration: "underline" }
const msgS: CSSProperties = { color: "#a7f3d0", fontSize: 11, marginTop: 8 }
const txS: CSSProperties = { fontSize: 11, marginTop: 4, wordBreak: "break-all" }
const verdictS: CSSProperties = { color: "#fbbf24", fontSize: 12, fontWeight: 700, marginTop: 6 }

function btnS(busy: boolean): CSSProperties {
	return { width: "100%", padding: "12px 16px", borderRadius: 8, border: "none", background: busy ? "#1a3a3a" : "#14b8a6", color: busy ? "#5eead4" : "#04090c", fontWeight: 800, fontSize: 13, letterSpacing: 1, cursor: busy ? "not-allowed" : "pointer" }
}

export default function PayCronus() {
	const { isConnected, address } = useAccount()
	const { connectAsync, connectors } = useConnect()
	const { switchChainAsync } = useSwitchChain()
	const { writeContractAsync } = useWriteContract()
	const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
	const [busy, setBusy] = useState(false)
	const [msg, setMsg] = useState("")
	const [tx, setTx] = useState("")
	const [verdict, setVerdict] = useState("")

	async function pay() {
		setTx(""); setVerdict(""); setMsg("")
		let connected = isConnected && !!address
		if (!connected) {
			const inj = connectors.find((c) => c.id === "injected") || connectors[0]
			if (!inj) { setMsg("No wallet detected. Install MetaMask, then try again."); return }
			try { await connectAsync({ connector: inj, chainId: ARC_CHAIN_ID }); connected = true } catch (_) { setMsg("Wallet connection cancelled."); return }
		}
		setBusy(true)
		try {
			try { await switchChainAsync({ chainId: ARC_CHAIN_ID }) } catch (_) {}
			const topic = "BTC-USDC momentum"
			const url = "/api/signal?topic=" + encodeURIComponent(topic)
			let amount = BigInt(20000)
			try {
				const r1 = await fetch(url)
				if (r1.status === 402) {
					const reqs = await r1.json()
					const acc = reqs && reqs.accepts && reqs.accepts[0]
					if (acc && acc.maxAmountRequired) amount = BigInt(acc.maxAmountRequired)
				}
			} catch (_) {}
			setMsg("Confirm the payment in your wallet...")
			const h = await writeContractAsync({ chainId: ARC_CHAIN_ID, address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "transfer", args: [PAY_TO, amount] })
			setTx(h)
			setMsg("Payment sent - confirming on Arc Testnet...")
			if (publicClient) { try { await publicClient.waitForTransactionReceipt({ hash: h }) } catch (_) {} }
			setMsg("Verifying on-chain and fetching your signal...")
			try {
				const r2 = await fetch(url, { headers: { "X-PAYMENT": h } })
				const out = await r2.json()
				if (out && out.paid && out.report) {
					setVerdict(String(out.report.verdict || "SKIP") + " - conviction " + Number(out.report.conviction || 0))
					setMsg("Done. Real on-chain payment verified - you now appear in the public settled-payments feed.")
				} else {
					setMsg("Paid on-chain. Signal verification: " + ((out && out.error) || ("HTTP " + r2.status)))
				}
			} catch (_) { setMsg("Paid on-chain - view your transaction on arcscan below.") }
		} catch (e) {
			const er = e as { shortMessage?: string; message?: string }
			setMsg("Payment cancelled or failed: " + String(er.shortMessage || er.message || e).slice(0, 120))
		}
		setBusy(false)
	}

	return (
		<section style={wrapS}>
			<div style={titleS}>{"Support Cronus \u2014 pay on-chain in one click"}</div>
			<div style={subS}>
				{"Connect your wallet and pay on Arc Testnet. One real on-chain USDC transaction \u2014 you'll appear in the public settled-payments feed. Need test USDC? Get it free at "}
				<a style={linkS} href="https://faucet.circle.com" target="_blank" rel="noreferrer">{"faucet.circle.com"}</a>
				{" (select Arc Testnet)."}
			</div>
			<button style={btnS(busy)} onClick={pay} disabled={busy}>
				{busy ? "WORKING..." : (isConnected ? "PAY 0.02 USDC ON ARC" : "CONNECT WALLET & PAY 0.02 USDC")}
			</button>
			{msg ? <div style={msgS}>{msg}</div> : null}
			{tx ? <div style={txS}><a style={linkS} href={"https://testnet.arcscan.app/tx/" + tx} target="_blank" rel="noreferrer">{"View your transaction on arcscan \u2197"}</a></div> : null}
			{verdict ? <div style={verdictS}>{"Your signal: " + verdict}</div> : null}
		</section>
	)
}
