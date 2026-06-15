import { useEffect, useState } from "react"
import { keccak256, toBytes } from "viem"
import MarketBoard from "../MarketBoard"
import SecurityPanel from "../SecurityPanel"
import type { CSSProperties } from "react"
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from "wagmi"
import { LiveSettlements } from "./LiveSettlements"

/* ============================================================
   CRONUS CAPITAL — WOW DASHBOARD (cyber-Egyptian)
   FORCE EXECUTE -> real 0.01 USDC test settlement on Arc Testnet
   ============================================================ */

type Trend = "up" | "down" | "flat"
type AgentState = "idle" | "scanning" | "analyzing" | "executing"
type Action = "LONG" | "SHORT" | "HOLD"

interface Kpi { id: string; label: string; value: string; sub: string; trend: Trend; accent: "green" | "gold"; progress?: number }
interface AgentInfo { id: string; name: string; role: string; glyph: string; state: AgentState; perf: number }
interface Signal { id: string; asset: string; action: Action; conf: number; time: string }

// === Arc Testnet settlement config — CUSTOMIZE here ===
const ARC_CHAIN_ID = 5042002
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const
const SETTLE_TO = "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd" as const // CRONUS treasury (test sink)
const TEST_AMOUNT = BigInt(10000) // 0.01 USDC (6 decimals)
const ERC20_ABI = [
	{
		type: "function",
		name: "transfer",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "to", type: "address" },
			{ name: "amount", type: "uint256" },
		],
		outputs: [{ name: "", type: "bool" }],
	},
] as const

function fmtUsd(n: number): string {
	return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

function WalletConnectModal(props: { open: boolean; onClose: () => void }) {
	const { connectors, connect, isPending } = useConnect()
	const { isConnected, address } = useAccount()
	const { disconnect } = useDisconnect()
	if (!props.open) return null

	const seen = new Set<string>()
	const list = connectors.filter((c) => {
		const key = (c.name || c.id || "").toLowerCase()
		if (!key || seen.has(key)) return false
		seen.add(key)
		return true
	})

	return (
		<div className="cd-modal-overlay" onClick={props.onClose}>
			<div className="cd-wallet-modal" onClick={(e) => e.stopPropagation()}>
				<div className="cd-modal-title">☥ CONNECT WALLET</div>
				{isConnected ? (
					<div className="cd-wallet-connected">
						<div className="cd-wallet-addr">{address ? address.slice(0, 6) + "…" + address.slice(-4) : "Connected"}</div>
						<button className="cd-btn cd-btn-danger" onClick={() => disconnect()}>DISCONNECT</button>
					</div>
				) : (
					<div className="cd-wallet-list">
						{list.map((c) => (
							<button key={c.uid} className="cd-wallet-row" disabled={isPending} onClick={() => connect({ connector: c })}>
								{c.icon ? <img className="cd-wallet-ico" src={c.icon} alt="" /> : <span className="cd-wallet-ico cd-wallet-ico-fb">{(c.name || "?").charAt(0)}</span>}
								<span className="cd-wallet-name">{c.name}</span>
								<span className="cd-wallet-arrow">→</span>
							</button>
						))}
						{list.length === 0 && <div className="cd-wallet-empty">No wallet detected. Install MetaMask, Rabby, OKX or Trust Wallet.</div>}
					</div>
				)}
				<button className="cd-btn cd-btn-ghost" onClick={props.onClose}>CLOSE</button>
			</div>
		</div>
	)
}

function ConfidenceRing(props: { value: number }) {
	const r = 46
	const circ = 2 * Math.PI * r
	const off = circ - (props.value / 100) * circ
	return (
		<div className="cd-ring-wrap">
			<svg className="cd-ring" viewBox="0 0 110 110">
				<circle className="cd-ring-bg" cx="55" cy="55" r={r} />
				<circle className="cd-ring-fg" cx="55" cy="55" r={r} strokeDasharray={circ} strokeDashoffset={off} />
			</svg>
			<div className="cd-ring-label">
				<span className="cd-ring-num">{props.value}</span>
				<span className="cd-ring-unit">%</span>
			</div>
		</div>
	)
}

function KpiCard(props: { kpi: Kpi }) {
	const k = props.kpi
	const arrow = k.trend === "up" ? "▲" : k.trend === "down" ? "▼" : "■"
	const trendClass = k.trend === "up" ? "cd-up" : k.trend === "down" ? "cd-down" : "cd-flat"
	const barStyle: CSSProperties = { width: (k.progress ?? 0) + "%" }
	return (
		<div className={"cd-card cd-accent-" + k.accent}>
			<div className="cd-card-glow" />
			<div className="cd-card-label">{k.label}</div>
			<div className="cd-card-value">{k.value}</div>
			<div className={"cd-card-sub " + trendClass}><span className="cd-arrow">{arrow}</span> {k.sub}</div>
			{typeof k.progress === "number" && (<div className="cd-bar"><div className="cd-bar-fill" style={barStyle} /></div>)}
		</div>
	)
}

function AgentRow(props: { a: AgentInfo }) {
	const a = props.a
	const perfStyle: CSSProperties = { width: a.perf + "%" }
	return (
		<div className={"cd-agent cd-agent-" + a.state}>
			<div className="cd-agent-glyph">{a.glyph}</div>
			<div className="cd-agent-main">
				<div className="cd-agent-name">{a.name}</div>
				<div className="cd-agent-role">{a.role}</div>
				<div className="cd-bar cd-bar-sm"><div className="cd-bar-fill" style={perfStyle} /></div>
			</div>
			<div className="cd-agent-state">{a.state}</div>
		</div>
	)
}

function MarketRadar(props: { blips: Array<{ id: string; x: number; y: number; hot: boolean }> }) {
	return (
		<div className="cd-radar">
			<div className="cd-radar-grid" />
			<div className="cd-radar-sweep" />
			{props.blips.map((b) => {
				const pos: CSSProperties = { left: b.x + "%", top: b.y + "%" }
				return <span key={b.id} className={"cd-blip" + (b.hot ? " cd-blip-hot" : "")} style={pos} />
			})}
		</div>
	)
}

function LiveTicker(props: { signals: Array<Signal> }) {
	const text = props.signals.map((s) => s.asset + " " + s.action + " · " + s.conf + "% · " + s.time).join("    𓂀    ")
	return (
		<div className="cd-ticker">
			<div className="cd-ticker-tag">𓆣 LIVE ORACLE FEED</div>
			<div className="cd-ticker-track">
				<span className="cd-ticker-run">{text}</span>
				<span className="cd-ticker-run">{text}</span>
			</div>
		</div>
	)
}

function RiskModal(props: { open: boolean; onClose: () => void }) {
	const [maxRisk, setMaxRisk] = useState(35)
	const [leverage, setLeverage] = useState(2)
	const [slippage, setSlippage] = useState(1)
	if (!props.open) return null
	return (
		<div className="cd-modal-overlay" onClick={props.onClose}>
			<div className="cd-modal" onClick={(e) => e.stopPropagation()}>
				<div className="cd-modal-title">☥ RISK PARAMETERS</div>
				<label className="cd-slider-row">
					<span>Max Risk Exposure</span><span className="cd-slider-val">{maxRisk}%</span>
					<input type="range" min={0} max={100} value={maxRisk} onChange={(e) => setMaxRisk(Number(e.target.value))} />
				</label>
				<label className="cd-slider-row">
					<span>Leverage</span><span className="cd-slider-val">{leverage}x</span>
					<input type="range" min={1} max={10} value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} />
				</label>
				<label className="cd-slider-row">
					<span>Max Slippage</span><span className="cd-slider-val">{slippage}%</span>
					<input type="range" min={0} max={5} value={slippage} onChange={(e) => setSlippage(Number(e.target.value))} />
				</label>
				<button className="cd-btn cd-btn-gold" onClick={props.onClose}>CONFIRM</button>
			</div>
		</div>
	)
}

const ROSTER = [
	{ id: "sentinel", name: "SENTINEL", role: "Risk Watch", glyph: "𓋹", perf: 88 },
	{ id: "herald", name: "HERALD", role: "Sentiment Scout", glyph: "𓁹", perf: 84 },
	{ id: "pythia", name: "PYTHIA", role: "Macro Oracle", glyph: "𓀀", perf: 91 },
	{ id: "warden", name: "WARDEN", role: "Compliance", glyph: "𓏏", perf: 86 },
]
export function CronusDashboard() {
	const [tick, setTick] = useState(0)
	const [ready, setReady] = useState(false)
	const [running, setRunning] = useState(false)
	const [riskOpen, setRiskOpen] = useState(false)
	const [walletOpen, setWalletOpen] = useState(false)
	const [deployed, setDeployed] = useState<Array<string>>(() => { try { const r = JSON.parse(localStorage.getItem("cronus_agents") || "[]"); return Array.isArray(r) ? r : [] } catch { return [] } })
	const deployAgent = () => { setDeployed((cur) => { const next = ROSTER.find((r) => !cur.includes(r.id)); if (!next) return cur; const updated = [...cur, next.id]; try { localStorage.setItem("cronus_agents", JSON.stringify(updated)) } catch { /* ignore */ } return updated }) }
	const [consultPhase, setConsultPhase] = useState<"idle" | "scout" | "analyst" | "executor">("idle")
	const [boost, setBoost] = useState(0)
	const { isConnected, address } = useAccount()
	const { switchChainAsync } = useSwitchChain()
	const { writeContractAsync, data: txHash, error: txError, isPending: txPending, reset: txReset } = useWriteContract()
	const { isLoading: txConfirming, isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash, chainId: ARC_CHAIN_ID })

	// CRONUS_SETTLEMENT_LOG: persist confirmed FORCE EXECUTE tx into cronus_decisions
	useEffect(() => {
		if (!txConfirmed || !txHash) return
		try {
			const raw = localStorage.getItem("cronus_decisions")
			const parsed = raw ? JSON.parse(raw) : []
			const list = Array.isArray(parsed) ? parsed : []
			if (list.some((r: { txHash?: string }) => r && r.txHash === txHash)) return
			const settleTs = Date.now()
			const prevHash: string = (list[0] && list[0].jobHash) ? String(list[0].jobHash) : "0x0000000000000000000000000000000000000000000000000000000000000000"
			const jobHash = keccak256(toBytes("CRONUS|Manual settlement|FORCE EXECUTE \u00b7 0.01 USDC settled on Arc Testnet|" + txHash + "|" + settleTs + "|" + prevHash))
			list.unshift({
				topic: "Manual settlement",
				decision: "FORCE EXECUTE \u00b7 0.01 USDC settled on Arc Testnet",
				txHash: txHash,
				timestamp: settleTs,
				agentId: "executor",
				jobHash: jobHash,
				prevHash: prevHash,
			})
			localStorage.setItem("cronus_decisions", JSON.stringify(list.slice(0, 50)))
			window.dispatchEvent(new StorageEvent("storage", { key: "cronus_decisions" }))
		} catch {
			/* ignore */
		}
	}, [txConfirmed, txHash])

	useEffect(() => {
		const t = setTimeout(() => setReady(true), 700)
		return () => clearTimeout(t)
	}, [])
	useEffect(() => {
		const id = setInterval(() => setTick((v) => v + 1), 2000)
		return () => clearInterval(id)
	}, [])

	// Live metrics derived from the on-chain ledger (localStorage state)
	const readJson = (k: string): unknown => { try { return JSON.parse(localStorage.getItem(k) || "null") } catch { return null } }
	const decisions = (readJson("cronus_decisions") as unknown[]) || []
	const earn = (readJson("cronus_earnings") as { calls?: number; usd?: number }) || { calls: 0, usd: 0 }
	const spend = (readJson("cronus.spend.v1") as { count?: number; usd?: number }) || { count: 0, usd: 0 }
	const settlements = Array.isArray(decisions) ? decisions.length : 0
	const usdcSettled = settlements * 0.01
	const revenue = Number((earn && earn.usd) || 0)
	const paidCalls = Number((earn && earn.calls) || 0)
	const agentSpend = Number((spend && spend.usd) || 0)
	const netFlow = revenue - agentSpend
	const confidence = Math.min(97, 78 + (tick % 9) + boost)
	const activeSignals = 5 + (tick % 4) + (boost > 0 ? 2 : 0)

	const kpis: Array<Kpi> = [
		{ id: "set", label: "USDC Settled", value: fmtUsd(usdcSettled), sub: settlements + " settlements", trend: "up", accent: "green", progress: Math.min(100, settlements * 8) },
		{ id: "rev", label: "Revenue (x402)", value: fmtUsd(revenue), sub: paidCalls + " paid calls", trend: revenue > 0 ? "up" : "flat", accent: "gold", progress: Math.min(100, paidCalls * 12) },
		{ id: "pc", label: "Paid Calls", value: String(paidCalls), sub: "x402 settled", trend: paidCalls > 0 ? "up" : "flat", accent: "green", progress: Math.min(100, paidCalls * 12) },
		{ id: "spd", label: "Agent Spend", value: fmtUsd(agentSpend), sub: "upstream per-call", trend: agentSpend > 0 ? "down" : "flat", accent: "gold", progress: Math.min(100, agentSpend * 40) },
		{ id: "net", label: "Net Flow", value: (netFlow >= 0 ? "+" : "-") + fmtUsd(Math.abs(netFlow)), sub: "revenue - spend", trend: netFlow >= 0 ? "up" : "down", accent: "green", progress: Math.min(100, Math.abs(netFlow) * 20) },
	]
	const agents: Array<AgentInfo> = [
		{ id: "scout", name: "SCOUT", role: "Signal Discovery", glyph: "𓅃", state: (consultPhase === "scout" || consultPhase === "analyst" || consultPhase === "executor") ? "scanning" : (running ? "scanning" : "idle"), perf: 92 },
		{ id: "analyst", name: "ANALYST", role: "Risk & Conviction", glyph: "𓂀", state: (consultPhase === "analyst" || consultPhase === "executor") ? "analyzing" : (running ? "analyzing" : "idle"), perf: 87 },
		{ id: "executor", name: "EXECUTOR", role: "On-chain Settlement", glyph: "𓊽", state: (txConfirming || txPending) ? "executing" : consultPhase === "executor" ? "executing" : (consultPhase === "scout" || consultPhase === "analyst") ? "analyzing" : (running ? "analyzing" : "idle"), perf: 95 },
	]
	const blips = [
		{ id: "b1", x: 28, y: 32 }, { id: "b2", x: 66, y: 44 }, { id: "b3", x: 48, y: 70 },
		{ id: "b4", x: 72, y: 24 }, { id: "b5", x: 38, y: 54 }, { id: "b6", x: 58, y: 62 },
	].map((b, i) => ({ ...b, hot: (i + tick) % 3 === 0 }))
	const signals: Array<Signal> = [
		{ id: "s1", asset: "BTC", action: "LONG", conf: 82, time: "12s" },
		{ id: "s2", asset: "ETH", action: "LONG", conf: 74, time: "41s" },
		{ id: "s3", asset: "SOL", action: "SHORT", conf: 68, time: "1m" },
		{ id: "s4", asset: "ARB", action: "HOLD", conf: 55, time: "2m" },
	]
	const skeletons = [0, 1, 2, 3, 4, 5]

	const memoSeed = (0x7f2a + tick * 13).toString(16).toUpperCase().slice(-4)
	const memo = "CRONUS-" + signals[0].asset + "-" + memoSeed
	const batchCount = 2 + (tick % 4)

	const privacy = [
		{ g: "𓂀", t: "Opt-in confidentiality", d: "Per-function privacy in plain Solidity" },
		{ g: "𓊽", t: "Composable", d: "Public + private finalize in one block" },
		{ g: "☥", t: "Governed visibility", d: "Auditors via signed query, others see nothing" },
		{ g: "𓆣", t: "Quantum-safe", d: "Hybrid post-quantum (harvest-now-decrypt-later)" },
	]

	const consult = () => {
		if (running) return; setRunning(true)
		// CUSTOMIZE: trigger your real Scout -> Analyst -> Executor pipeline here
		setConsultPhase("scout"); setTimeout(() => setConsultPhase("analyst"), 850); setTimeout(() => setConsultPhase("executor"), 1700); setTimeout(() => { setBoost(6 + Math.floor(Math.random() * 8)); setConsultPhase("idle"); setRunning(false) }, 2700)
	}

	// FORCE EXECUTE -> real test settlement tx on Arc Testnet (0.01 USDC self-transfer)
	const forceExecute = async () => {
		if (!isConnected || !address) { setWalletOpen(true); return }
		const ok = window.confirm("FORCE EXECUTE\n\nSend a 0.01 USDC test settlement on Arc Testnet?\n(Real on-chain tx — gas only, funds go to treasury.)")
		if (!ok) return
		txReset()
		try { await switchChainAsync({ chainId: ARC_CHAIN_ID }) } catch { /* may already be on Arc, or wallet will prompt */ }
		try {
			await writeContractAsync({
				chainId: ARC_CHAIN_ID,
				address: USDC_ADDRESS,
				abi: ERC20_ABI,
				functionName: "transfer",
				args: [SETTLE_TO, TEST_AMOUNT],
			})
		} catch { /* error is surfaced via txError below */ }
	}

	const txBusy = txPending || txConfirming
		const extraAgents: Array<AgentInfo> = []
		for (const did of deployed) { const c = ROSTER.find((r) => r.id === did); if (c) extraAgents.push({ id: c.id, name: c.name, role: c.role, glyph: c.glyph, state: running ? "analyzing" : "idle", perf: c.perf }) }
	const walletLabel = isConnected && address ? "☥ " + address.slice(0, 4) + "…" + address.slice(-4) : "☥ CONNECT"
	const txErrText = txError ? String((txError as { shortMessage?: string }).shortMessage || (txError as Error).message || txError).slice(0, 140) : ""

	return (
		<section className={"cd-root" + (running || txBusy ? " cd-running" : "")}>
			<header className="cd-header">
				<div className="cd-eye">𓂀</div>
				<div className="cd-head-text">
					<div className="cd-head-title">CRONUS ORACLE DASHBOARD</div>
					<div className="cd-head-sub">Autonomous Market Intelligence · Arc Network · USDC</div>
					<div className="cd-badge">⚡ v0.7.2 READY · MEMO + BATCHED PAYMENTS</div>
				</div>
				<button className={"cd-ankh" + (isConnected ? " cd-ankh-on" : "")} title="Connect Wallet" onClick={() => setWalletOpen(true)}>{walletLabel}</button>
			</header>

			{ready ? (
				<div className="cd-grid cd-kpi-grid">
					{kpis.map((k) => <KpiCard key={k.id} kpi={k} />)}
					<div className="cd-card cd-accent-green cd-conf-card">
						<div className="cd-card-label">Confidence Score</div>
						<ConfidenceRing value={confidence} />
						<div className="cd-card-sub cd-up"><span className="cd-arrow">▲</span> {activeSignals} active signals</div>
					</div>
				</div>
			) : (
				<div className="cd-grid cd-kpi-grid">
					{skeletons.map((s) => <div key={s} className="cd-card cd-skel" />)}
				</div>
			)}

			<div className="cd-mid">
				<div className="cd-panel cd-agents">
					<div className="cd-panel-title">𓀭 AGENT PIPELINE</div>
					{agents.map((a) => <AgentRow key={a.id} a={a} />)}
					{extraAgents.map((a) => <AgentRow key={a.id} a={a} />)}
				</div>
				<div className="cd-panel cd-radar-panel">
					<div className="cd-panel-title">𓂀 MARKET INTELLIGENCE</div>
					<MarketRadar blips={blips} />
				</div>
				<div className="cd-panel cd-actions">
					<div className="cd-panel-title">⚡ ORACLE ACTIONS</div>
					<button className="cd-btn cd-btn-primary" onClick={consult} disabled={running}>{running ? "CONSULTING…" : "CONSULT ORACLES"}</button>
					<button className="cd-btn cd-btn-exec" onClick={forceExecute} disabled={txBusy}>{txBusy ? "EXECUTING…" : "FORCE EXECUTE"}</button>
					<button className="cd-btn cd-btn-gold" onClick={() => setRiskOpen(true)}>RISK ADJUST</button>
					<a className="cd-btn cd-btn-ghost" href="https://testnet.arcscan.app" target="_blank" rel="noreferrer">VIEW ON ARC ↗</a>
					<button className="cd-btn cd-btn-deploy" onClick={deployAgent} disabled={deployed.length >= ROSTER.length}>{deployed.length >= ROSTER.length ? "✓ ALL AGENTS DEPLOYED" : "＋ DEPLOY NEW AGENT"}</button>
				</div>
			</div>

			<MarketBoard />
						<SecurityPanel />
			{(txBusy || txConfirmed || txError) && (
				<div className={"cd-tx" + (txError ? " cd-tx-err" : txConfirmed ? " cd-tx-ok" : "")}>
					<span className="cd-tx-glyph">𓊽</span>
					<div className="cd-tx-body">
						<span>{txError ? "Execution failed: " + txErrText : txConfirmed ? "✓ Settlement confirmed on Arc Testnet" : txConfirming ? "Settling on-chain… awaiting confirmation" : "Awaiting wallet signature…"}</span>
						{txHash && <a className="cd-tx-link" href={"https://testnet.arcscan.app/tx/" + txHash} target="_blank" rel="noreferrer">{txHash.slice(0, 10)}…{txHash.slice(-8)} ↗</a>}
					</div>
					<button className="cd-tx-x" onClick={() => txReset()}>✕</button>
				</div>
			)}

			<LiveTicker signals={signals} />
					<LiveSettlements />

			<div className="cd-memo">
				<span className="cd-memo-tag">𓏏 ARC v0.7.2</span>
				Last settlement memo: <b>{memo}</b> · batched <b>{batchCount}</b> calls ✓ · reconciliation-ready
			</div>

			<div className="cd-panel">
				<div className="cd-panel-title">🔒 ARC PRIVACY SECTOR · ROADMAP</div>
				<div className="cd-roadmap-grid">
					{privacy.map((p) => (
						<div key={p.t} className="cd-rm">
							<div className="cd-rm-glyph">{p.g}</div>
							<div>
								<div className="cd-rm-t">{p.t}</div>
								<div className="cd-rm-d">{p.d}</div>
							</div>
						</div>
					))}
				</div>
				<div className="cd-rm-note">Proposed design — confidential agent strategies & positions (not live yet).</div>
			</div>

			{(running || txBusy) && <div className="cd-scan" />}
			<RiskModal open={riskOpen} onClose={() => setRiskOpen(false)} />
			<WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
		</section>
	)
}
