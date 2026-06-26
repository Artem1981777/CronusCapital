import { useState, useEffect } from "react"
import type { CSSProperties, ChangeEvent } from "react"

const API = "/api/agent-payout"
const ARCSCAN = "https://testnet.arcscan" + ".app/tx/"

type Policy = {
	enabled: boolean
	recipientG: string
	sharePct: number
	minThresholdUSDC: number
	perPayoutCapUSDC: number
}
type Entry = {
	at?: string
	action: string
	amount: number
	available?: number
	recipientG?: string
	reason?: string
	hash?: string
	executed?: boolean
	arcBurnTx?: string
	signer?: string
	trigger?: string
}

const card: CSSProperties = { border: "1px solid rgba(168,85,247,0.4)", borderRadius: "14px", padding: "18px", margin: "18px 0", background: "rgba(20,12,30,0.6)" }
const title: CSSProperties = { color: "#c084fc", fontWeight: 700, fontSize: "20px", marginBottom: "10px" }
const sub: CSSProperties = { color: "#cbd5e1", fontSize: "14px", lineHeight: "1.5", marginBottom: "12px" }
const rowS: CSSProperties = { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(148,163,184,0.15)", fontSize: "14px", color: "#e2e8f0" }
const inp: CSSProperties = { width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid rgba(148,163,184,0.4)", background: "rgba(0,0,0,0.4)", color: "#fff", fontSize: "15px", boxSizing: "border-box" }
const btn: CSSProperties = { width: "100%", padding: "14px", marginTop: "10px", borderRadius: "10px", border: "none", background: "#a855f7", color: "#fff", fontWeight: 700, fontSize: "15px", cursor: "pointer" }
const btnGo: CSSProperties = { width: "100%", padding: "14px", marginTop: "8px", borderRadius: "10px", border: "none", background: "#22c55e", color: "#04210f", fontWeight: 700, fontSize: "15px", cursor: "pointer" }
const btnExec: CSSProperties = { width: "100%", padding: "14px", marginTop: "8px", borderRadius: "10px", border: "none", background: "#10b981", color: "#04210f", fontWeight: 700, fontSize: "15px", cursor: "pointer" }
const note: CSSProperties = { fontSize: "12px", color: "#94a3b8", marginTop: "8px" }
const dcard: CSSProperties = { marginTop: "12px", padding: "14px", borderRadius: "10px", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(168,85,247,0.3)" }
const xcard: CSSProperties = { marginTop: "12px", padding: "14px", borderRadius: "10px", background: "rgba(4,33,15,0.5)", border: "1px solid rgba(16,185,129,0.5)" }
const tagPay: CSSProperties = { color: "#22c55e", fontWeight: 700 }
const tagHold: CSSProperties = { color: "#f59e0b", fontWeight: 700 }
const tagExec: CSSProperties = { color: "#34d399", fontWeight: 700, marginBottom: "6px" }
const lnk: CSSProperties = { color: "#67e8f9", textDecoration: "underline" }
const led: CSSProperties = { fontSize: "12px", color: "#94a3b8", padding: "4px 0" }
const wrap: CSSProperties = { marginTop: "12px" }
const wrapL: CSSProperties = { marginTop: "14px" }

function shorten(h: string) { if (!h) return ""; return h.slice(0, 8) + ".." + h.slice(-6) }

export default function AgentPayout() {
	const [policy, setPolicy] = useState<Policy | null>(null)
	const [avail, setAvail] = useState("4")
	const [decision, setDecision] = useState<Entry | null>(null)
	const [ledger, setLedger] = useState<Entry[]>([])
	const [busy, setBusy] = useState(false)
	const [msg, setMsg] = useState("")
	const [execBusy, setExecBusy] = useState(false)
	const [execMsg, setExecMsg] = useState("")
	const [exec, setExec] = useState<Entry | null>(null)
	const [execTx, setExecTx] = useState("")

	async function loadStatus() {
		try {
			const r = await fetch(API + "?action=status")
			const j = await r.json()
			if (j.policy) setPolicy(j.policy)
			if (Array.isArray(j.ledger)) setLedger(j.ledger)
		} catch { setMsg("status unavailable") }
	}
	useEffect(function () { loadStatus() }, [])

	async function runDecision() {
		setBusy(true)
		setMsg("")
		try {
			const r = await fetch(API + "?action=decide&available=" + encodeURIComponent(avail))
			const j = await r.json()
			if (j.decision) { setDecision(j.decision); loadStatus() }
			else setMsg(j.detail || "no decision")
		} catch { setMsg("decision failed") }
		setBusy(false)
	}

	async function executeOnServer() {
		setExecBusy(true)
		setExecMsg("")
		try {
			const r = await fetch(API + "?action=execute&available=" + encodeURIComponent(avail))
			const j = await r.json()
			if (j.executed && j.arcBurnTx) {
				setExec(j.decision || null)
				setExecTx(j.arcBurnTx)
				loadStatus()
			} else if (j.pending) {
				setExecMsg("Approval submitted, click again in about 30 seconds to finish the burn")
			} else if (j.decision) {
				setExec(j.decision)
				setExecTx("")
				setExecMsg(j.decision.reason || "agent decided to hold")
			} else {
				setExecMsg(j.detail || "execution did not run")
			}
		} catch { setExecMsg("execution failed") }
		setExecBusy(false)
	}

	function executeOnArc() {
		const el = document.getElementById("cap-stellar")
		if (el) el.scrollIntoView({ behavior: "smooth" })
	}

	return (
		<div id="cap-payout" style={card}>
			<div style={title}>Autonomous payout agent</div>
			<div style={sub}>
				Cronus earns USDC on Arc via x402. This agent evaluates available revenue against a policy and decides, on its own, when and how much to route to Stellar for creator payouts and remittances. It can execute the cross-chain burn itself, server-signed by the treasury with no browser wallet. Every decision is recorded in a keccak-chained ledger.
			</div>
			{policy ? (
				<div>
					<div style={rowS}><span>Enabled</span><span>{policy.enabled ? "yes" : "no"}</span></div>
					<div style={rowS}><span>Recipient</span><span>{shorten(policy.recipientG)}</span></div>
					<div style={rowS}><span>Share of revenue</span><span>{policy.sharePct} percent</span></div>
					<div style={rowS}><span>Min threshold</span><span>{policy.minThresholdUSDC} USDC</span></div>
					<div style={rowS}><span>Per-payout cap</span><span>{policy.perPayoutCapUSDC} USDC</span></div>
				</div>
			) : null}

			<div style={wrap}>
				<div style={note}>Available revenue (USDC) to evaluate</div>
				<input
					style={inp}
					value={avail}
					onChange={function (e: ChangeEvent<HTMLInputElement>) { setAvail(e.target.value) }}
					placeholder="4"
				/>
			</div>
			<button style={btn} onClick={runDecision} disabled={busy}>
				{busy ? "Agent deciding..." : "Run agent decision"}
			</button>
			<button style={btnExec} onClick={executeOnServer} disabled={execBusy}>
				{execBusy ? "Agent executing on Arc..." : "Agent executes on Arc (server-signed)"}
			</button>

			{execTx ? (
				<div style={xcard}>
					<div style={tagExec}>SERVER-SIGNED BURN EXECUTED</div>
					{exec ? (<div style={rowS}><span>Amount</span><span>{exec.amount.toFixed(4)} USDC</span></div>) : null}
					<div style={rowS}><span>Arc burn tx</span><a href={ARCSCAN + execTx} target="_blank" rel="noreferrer" style={lnk}>{shorten(execTx)}</a></div>
					{exec && exec.signer ? (<div style={rowS}><span>Signer</span><span>{shorten(exec.signer)}</span></div>) : null}
					<div style={note}>Treasury signed and submitted this CCTP burn on Arc with no browser wallet. Confirm it on the explorer.</div>
				</div>
			) : null}
			{execMsg ? <div style={note}>{execMsg}</div> : null}

			{decision ? (
				<div style={dcard}>
					<div style={decision.action === "payout" ? tagPay : tagHold}>
						{decision.action === "payout" ? "DECISION: PAYOUT" : "DECISION: HOLD"}
					</div>
					<div style={rowS}><span>Amount</span><span>{decision.amount.toFixed(4)} USDC</span></div>
					<div style={rowS}><span>Reason</span><span>{decision.reason}</span></div>
					{decision.hash ? (<div style={rowS}><span>Ledger hash</span><span>{shorten(decision.hash)}</span></div>) : null}
					{decision.action === "payout" ? (
						<button style={btnGo} onClick={executeOnArc}>Execute this payout on Arc (in-browser wallet)</button>
					) : null}
				</div>
			) : null}

			{msg ? <div style={note}>{msg}</div> : null}

			{ledger.length > 0 ? (
				<div style={wrapL}>
					<div style={note}>Recent agent decisions</div>
					{ledger.map(function (e: Entry, i: number) {
						return (
							<div key={i} style={led}>
								{(e.at || "").slice(0, 19)} | {e.action} | {e.amount.toFixed(4)} USDC{e.executed ? " | executed" : ""} | {shorten(e.hash || "")}
								{e.arcBurnTx ? (<span> | <a href={ARCSCAN + e.arcBurnTx} target="_blank" rel="noreferrer" style={lnk}>{shorten(e.arcBurnTx)}</a></span>) : null}
							</div>
						)
					})}
				</div>
			) : null}
		</div>
	)
}
