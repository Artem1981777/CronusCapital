import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { keccak256, toBytes } from "viem"

const GENESIS = "0x0000000000000000000000000000000000000000000000000000000000000000"
const POLL_MS = 2000
const GOLD = "#c9a84c"
const GREEN = "#39e014"
const RED = "#e0563a"
const DIM = "#7e8c6a"

interface Entry {
	topic?: string
	decision?: string
	txHash?: string
	timestamp?: number
	agentId?: string
	jobHash?: string
	prevHash?: string
}
interface Verdict {
	chained: number
	total: number
	verified: number
	linked: number
	links: number
	intact: boolean
	head: string
}

function readEntries(): Array<Entry> {
	try {
		const raw = JSON.parse(localStorage.getItem("cronus_decisions") || "[]")
		return Array.isArray(raw) ? raw : []
	} catch {
		return []
	}
}
function canonical(e: Entry): string {
	return "CRONUS|" + (e.topic || "") + "|" + (e.decision || "") + "|" + (e.txHash || "") + "|" + (e.timestamp || 0) + "|" + (e.prevHash || GENESIS)
}
function shorten(h: string): string {
	return h.length > 18 ? h.slice(0, 10) + "\u2026" + h.slice(-8) : h
}
function verify(entries: Array<Entry>): Verdict {
	const chained = entries.filter((e) => e && e.jobHash && e.prevHash)
	let verified = 0
	for (const e of chained) {
		try {
			if (keccak256(toBytes(canonical(e))) === e.jobHash) verified += 1
		} catch {
			/* ignore */
		}
	}
	let links = 0
	let linked = 0
	for (let i = 0; i < entries.length; i++) {
		const e = entries[i]
		if (!e || !e.prevHash) continue
		links += 1
		const next = entries[i + 1]
		if (next && next.jobHash) {
			if (e.prevHash === next.jobHash) linked += 1
		} else if (e.prevHash === GENESIS) {
			linked += 1
		}
	}
	const intact = chained.length > 0 && verified === chained.length && linked === links
	const head = chained.length > 0 ? String(chained[0].jobHash) : GENESIS
	return { chained: chained.length, total: entries.length, verified, linked, links, intact, head }
}

const wrap: CSSProperties = { border: "1px solid rgba(201,168,76,0.28)", borderRadius: 14, padding: "16px 18px", margin: "14px 0", background: "linear-gradient(180deg, rgba(10,14,9,0.6), rgba(6,9,6,0.6))" }
const head: CSSProperties = { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }
const title: CSSProperties = { color: GOLD, fontFamily: "Cinzel, serif", fontSize: 15, letterSpacing: 1.5, textTransform: "uppercase" }
const sub: CSSProperties = { color: DIM, fontSize: 11, letterSpacing: 0.6 }
const statRow: CSSProperties = { display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12 }
const stat: CSSProperties = { display: "flex", flexDirection: "column", gap: 2 }
const statLabel: CSSProperties = { color: DIM, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }
const statVal: CSSProperties = { color: GREEN, fontSize: 17, fontWeight: 700 }
const headRow: CSSProperties = { marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }
const headLabel: CSSProperties = { color: DIM, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }
const headVal: CSSProperties = { color: GOLD, fontFamily: "monospace", fontSize: 12 }
const chainRow: CSSProperties = { marginTop: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }
const chainItem: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6 }
const chip: CSSProperties = { color: GREEN, fontFamily: "monospace", fontSize: 11, border: "1px solid rgba(57,224,20,0.3)", borderRadius: 6, padding: "2px 6px" }
const arrow: CSSProperties = { color: DIM, fontSize: 12 }
const btn: CSSProperties = { marginTop: 14, background: "transparent", border: "1px solid rgba(201,168,76,0.5)", color: GOLD, borderRadius: 8, padding: "8px 14px", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }
const note: CSSProperties = { color: DIM, fontSize: 11, marginTop: 10 }

function badge(ok: boolean): CSSProperties {
	return { color: ok ? GREEN : RED, fontSize: 17, fontWeight: 700 }
}

export default function VerifiableLedger() {
	const [verdict, setVerdict] = useState<Verdict>(() => verify(readEntries()))
	const [chips, setChips] = useState<Array<string>>([])
	const [flash, setFlash] = useState(0)

	const run = useCallback(() => {
		const e = readEntries()
		setVerdict(verify(e))
		setChips(e.filter((x) => x && x.jobHash && x.prevHash).slice(0, 5).map((x) => shorten(String(x.jobHash))))
	}, [])

	useEffect(() => {
		run()
		const id = setInterval(run, POLL_MS)
		return () => clearInterval(id)
	}, [run])

	const onVerify = useCallback(() => {
		run()
		setFlash(Date.now())
	}, [run])

	return (
		<section style={wrap}>
			<div style={head}>
				<span style={title}>{"\u{13289}"} Verifiable Decision Ledger</span>
				<span style={sub}>hash-chained keccak256 {"\u00b7"} on-chain anchored {"\u00b7"} tamper-evident</span>
			</div>
			{verdict.chained === 0 ? (
				<div style={note}>No chained decisions yet {"\u2014"} run FORCE EXECUTE to anchor the first verifiable, hash-linked entry.</div>
			) : (
				<>
					<div style={statRow}>
						<div style={stat}><span style={statLabel}>Verified</span><span style={statVal}>{verdict.verified}/{verdict.chained}</span></div>
						<div style={stat}><span style={statLabel}>Chain links</span><span style={statVal}>{verdict.linked}/{verdict.links}</span></div>
						<div style={stat}><span style={statLabel}>Integrity</span><span style={badge(verdict.intact)}>{verdict.intact ? "INTACT" : "BROKEN"}</span></div>
						<div style={stat}><span style={statLabel}>Decisions</span><span style={statVal}>{verdict.total}</span></div>
					</div>
					<div style={headRow}>
						<span style={headLabel}>Ledger head</span>
						<span style={headVal}>{shorten(verdict.head)}</span>
					</div>
					{chips.length > 0 ? (
						<div style={chainRow}>
							{chips.map((c, i) => (
								<span key={c + i} style={chainItem}>
									<span style={chip}>{c}</span>
									{i < chips.length - 1 ? <span style={arrow}>{"\u2190"}</span> : null}
								</span>
							))}
						</div>
					) : null}
				</>
			)}
			<button style={btn} onClick={onVerify}>Re-verify ledger</button>
			{flash > 0 ? <span style={note}> {"\u2713"} re-verified locally just now</span> : null}
		</section>
	)
}
