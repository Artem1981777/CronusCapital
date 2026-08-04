import { useState } from "react"
import { useAccount, useWriteContract, usePublicClient, useChainId, useSwitchChain } from "wagmi"

// Arc Testnet <-> EVM testnets USDC bridge via Circle CCTP V2 (burn-and-mint), either direction.
// Non-custodial: every tx is signed by the visitor's own connected wallet.
// Addresses verified against https://developers.circle.com/cctp/references/contract-addresses
type Hex = `0x${string}`

// V2 contracts are identical across all supported EVM testnets (including Arc).
import { evaluateIntent, isVerifiedRoute } from "../../lib/intentPolicyCore.js"
import { ensureChain, isSupportedChain } from "../lib/chains"

// The policy layer speaks canonical network keys; this widget uses its own shorter keys.
// Mapping them here keeps both vocabularies intact instead of bending one to the other.
const POLICY_TO_UI: Record<string, string> = {
  arc: "arc", base: "base", ethereum: "eth", arbitrum: "arb", optimism: "op", avalanche: "avax",
}

const TOKEN_MESSENGER_V2 = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA"
const MESSAGE_TRANSMITTER_V2 = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275"

type ChainInfo = { key: string; name: string; chainId: number; domain: number; usdc: Hex; scan: string }

// Arc is always one side of the route.
const ARC: ChainInfo = { key: "arc", name: "Arc Testnet", chainId: 5042002, domain: 26, usdc: "0x3600000000000000000000000000000000000000", scan: "https://testnet.arcscan.app/tx/" }

// The paired chain; pick which one + which direction on the dashboard.
const CHAINS: ChainInfo[] = [
  { key: "base", name: "Base Sepolia", chainId: 84532, domain: 6, usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", scan: "https://sepolia.basescan.org/tx/" },
  { key: "eth", name: "Ethereum Sepolia", chainId: 11155111, domain: 0, usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", scan: "https://sepolia.etherscan.io/tx/" },
  { key: "arb", name: "Arbitrum Sepolia", chainId: 421614, domain: 3, usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", scan: "https://sepolia.arbiscan.io/tx/" },
  { key: "op", name: "OP Sepolia", chainId: 11155420, domain: 2, usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", scan: "https://sepolia-optimism.etherscan.io/tx/" },
  { key: "avax", name: "Avalanche Fuji", chainId: 43113, domain: 1, usdc: "0x5425890298aed601595a70AB815c96711a31Bc65", scan: "https://testnet.snowtrace.io/tx/" },
]

// CCTP V2 uses the same TokenMessengerV2 and MessageTransmitterV2 on every supported
// network, so every ordered pair is routable. Arc is a destination, not a required hub.
const ALL_CHAINS: ChainInfo[] = [ARC, ...CHAINS]

// Routes Cronus has actually executed on-chain with published hashes. Everything else is
// routable but unproven by us, and the UI says so rather than implying we tested it.
// Derived, never re-typed: the executed-route list lives only in the policy core, and this
// map is the inverse of POLICY_TO_UI, so the two vocabularies cannot drift apart.
const UI_TO_POLICY: Record<string, string> = Object.fromEntries(
  Object.entries(POLICY_TO_UI).map(([policyKey, uiKey]) => [uiKey, policyKey]),
)

const IRIS = "https://iris-api-sandbox.circle.com"
const ZERO32 = "0x0000000000000000000000000000000000000000000000000000000000000000"
const DASH = "\u2014"
const ARROW = "\u2192"
const SWAP = "\u21C4"
const HKEY = "cronus_bridge_history_v1"

type Entry = { id: number; route: string; amount: string; burnTx: string; burnUrl: string; mintTx: string; mintUrl: string; status: string }

function loadHistory(): Entry[] {
  try { const raw = localStorage.getItem(HKEY); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : [] } catch { return [] }
}
function persist(next: Entry[]) { try { localStorage.setItem(HKEY, JSON.stringify(next)) } catch { /* ignore quota/SSR */ } }

const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
]
const TM_ABI = [
  { type: "function", name: "depositForBurn", stateMutability: "nonpayable", inputs: [
    { name: "amount", type: "uint256" },
    { name: "destinationDomain", type: "uint32" },
    { name: "mintRecipient", type: "bytes32" },
    { name: "burnToken", type: "address" },
    { name: "destinationCaller", type: "bytes32" },
    { name: "maxFee", type: "uint256" },
    { name: "minFinalityThreshold", type: "uint32" },
  ], outputs: [] },
]
const MT_ABI = [
  { type: "function", name: "receiveMessage", stateMutability: "nonpayable", inputs: [
    { name: "message", type: "bytes" },
    { name: "attestation", type: "bytes" },
  ], outputs: [{ name: "", type: "bool" }] },
]

function toUnits(a: string, d: number): bigint {
  const s = (a || "").trim()
  if (!s) return 0n
  const parts = s.split(".")
  const whole = parts[0] || "0"
  let frac = parts[1] || ""
  frac = (frac + "0".repeat(d)).slice(0, d)
  return BigInt(whole) * (10n ** BigInt(d)) + BigInt(frac || "0")
}
function addrToBytes32(a: string): string {
  return "0x000000000000000000000000" + a.slice(2).toLowerCase()
}
function shorten(x: string): string { return x ? x.slice(0, 8) + "\u2026" + x.slice(-6) : "" }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }
// UTC only. A local clock would disagree with the on-chain record and with README,
// and a reviewer in another timezone would see a mismatch that looks like tampering.
function fmtTime(id: number): string { try { return new Date(id).toISOString().replace("T", " ").slice(0, 19) + " UTC" } catch { return "" } }

export default function CronusBridge() {
  const { address, isConnected, connector } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const [fromKey, setFromKey] = useState("base")
  const [toKey, setToKey] = useState("arc")
  const source = ALL_CHAINS.find((c) => c.key === fromKey) || CHAINS[0]
  const dest = ALL_CHAINS.find((c) => c.key === toKey) || ARC
  const sameNetwork = source.key === dest.key
  const routeVerified = isVerifiedRoute(UI_TO_POLICY[source.key], UI_TO_POLICY[dest.key])
  const sourceClient = usePublicClient({ chainId: source.chainId })
  const destClient = usePublicClient({ chainId: dest.chainId })
  const [amount, setAmount] = useState("1")
  const [step, setStep] = useState("")
  const [burnTx, setBurnTx] = useState("")
  const [mintTx, setMintTx] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<Entry[]>(loadHistory)
  const [intentText, setIntentText] = useState("")
  const [plan, setPlan] = useState<any>(null)

  // Reads the sentence with the same module the test suite and the server use. Nothing is
  // executed here: the result only describes what policy would decide, and why.
  function readIntent() {
    const text = intentText.trim()
    if (!text) return
    setPlan(evaluateIntent(text, { sender: address ? address.toLowerCase() : undefined }))
  }

  function planSummary(d: any): string {
    const p = d.parsed
    if (!p.ok) return "no executable plan"
    if (p.kind === "bridge") {
      return p.amount + " USDC " + p.from + " " + ARROW + " " + p.to +
        (p.routeVerified ? " (route executed on-chain by Cronus)" : " (route not yet executed by us)")
    }
    return p.amount + " " + String(p.fromToken).toUpperCase() + " " + ARROW +
      " " + String(p.toToken).toUpperCase() + " on Arc"
  }

  // Only a bridge that policy already allowed may prefill the form, and prefilling is all
  // it does: the transaction still has to be reviewed and signed in your own wallet.
  // Without a wallet the kernel rejects on recipient validation before it ever reaches the
  // caps, so a decision shown here would be an artefact of the missing address rather than
  // a judgement on the request. Parser refusals need no address and are always shown.
  function judged(d: any): boolean {
    return d.parsed.ok === false || isConnected
  }

  function canApply(d: any): boolean {
    return d.allow === true && d.parsed.ok === true && d.parsed.kind === "bridge" &&
      !!POLICY_TO_UI[d.parsed.from] && !!POLICY_TO_UI[d.parsed.to]
  }

  function applyPlan() {
    if (!plan || !canApply(plan)) return
    setFromKey(POLICY_TO_UI[plan.parsed.from])
    setToKey(POLICY_TO_UI[plan.parsed.to])
    setAmount(plan.parsed.amount)
    setPlan(null)
    setIntentText("")
  }

  function pushEntry(e: Entry) {
    setHistory((prev) => { const next = [e, ...prev].slice(0, 25); persist(next); return next })
  }
  function patchEntry(id: number, patch: Partial<Entry>) {
    setHistory((prev) => { const next = prev.map((x) => (x.id === id ? { ...x, ...patch } : x)); persist(next); return next })
  }
  function clearHistory() { setHistory([]); persist([]) }

  async function bridge() {
    setErr(""); setBurnTx(""); setMintTx(""); setStep("")
    if (!isConnected || !address) { setErr("Connect your wallet first (button at top)."); return }
    if (!sourceClient) { setErr(source.name + " RPC client unavailable."); return }
    if (!destClient) { setErr(dest.name + " RPC client unavailable."); return }
    if (!isSupportedChain(source.chainId) || !isSupportedChain(dest.chainId)) { setErr("Blocked: this route includes a non-testnet network."); return }
    const amt = toUnits(amount, 6)
    if (amt <= 0n) { setErr("Enter an amount greater than 0."); return }
    const route = source.name + " " + ARROW + " " + dest.name
    let entryId = 0
    setBusy(true)
    try {
      if (chainId !== source.chainId) {
        setStep("Switching wallet to " + source.name + DASH)
        await ensureChain(source.chainId, { switchChainAsync, getProvider: () => connector?.getProvider?.() })
      }
      const maxFee = amt / 100n
      const bal = await sourceClient.readContract({ address: source.usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }) as bigint
      if (bal < amt) throw new Error("Insufficient " + source.name + " USDC balance. Fund this wallet at faucet.circle.com and retry.")
      let allowance = await sourceClient.readContract({ address: source.usdc, abi: ERC20_ABI, functionName: "allowance", args: [address, TOKEN_MESSENGER_V2] }) as bigint
      if (allowance < amt) {
        setStep("1/4 Approving USDC on " + source.name + DASH)
        const approveHash = await writeContractAsync({
          chainId: source.chainId,
          address: source.usdc,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [TOKEN_MESSENGER_V2, amt],
        } as any)
        await sourceClient.waitForTransactionReceipt({ hash: approveHash })
        for (let i = 0; i < 10 && allowance < amt; i++) {
          await sleep(1500)
          allowance = await sourceClient.readContract({ address: source.usdc, abi: ERC20_ABI, functionName: "allowance", args: [address, TOKEN_MESSENGER_V2] }) as bigint
        }
      }
      setStep("2/4 Burning USDC on " + source.name + " (CCTP V2)" + DASH)
      await sourceClient.simulateContract({ account: address, chainId: source.chainId, address: TOKEN_MESSENGER_V2, abi: TM_ABI, functionName: "depositForBurn", args: [amt, dest.domain, addrToBytes32(address), source.usdc, ZERO32, maxFee, 1000] } as any)
      const bHash = await writeContractAsync({
        chainId: source.chainId,
        address: TOKEN_MESSENGER_V2,
        abi: TM_ABI,
        functionName: "depositForBurn",
        args: [amt, dest.domain, addrToBytes32(address), source.usdc, ZERO32, maxFee, 1000],
      } as any)
      await sourceClient.waitForTransactionReceipt({ hash: bHash })
      setBurnTx(bHash)
      entryId = Date.now()
      pushEntry({ id: entryId, route, amount, burnTx: bHash, burnUrl: source.scan + bHash, mintTx: "", mintUrl: "", status: "attesting" })
      setStep("3/4 Waiting for Circle attestation" + DASH)
      let msg: any = null
      for (let i = 0; i < 60; i++) {
        try {
          const r = await fetch(IRIS + "/v2/messages/" + source.domain + "?transactionHash=" + bHash)
          if (r.ok) {
            const j = await r.json()
            const m = j && j.messages && j.messages[0]
            if (m && m.status === "complete" && m.attestation && m.attestation !== "PENDING") { msg = m; break }
          }
        } catch { /* retry */ }
        await sleep(5000)
      }
      if (!msg) { patchEntry(entryId, { status: "mint pending" }); throw new Error("Attestation timed out. Your burn is safe; the mint can be completed later with the burn tx.") }
      setStep("4/4 Minting on " + dest.name + DASH)
      await ensureChain(dest.chainId, { switchChainAsync, getProvider: () => connector?.getProvider?.() })
      const mHash = await writeContractAsync({
        chainId: dest.chainId,
        address: MESSAGE_TRANSMITTER_V2,
        abi: MT_ABI,
        functionName: "receiveMessage",
        args: [msg.message, msg.attestation],
      } as any)
      await destClient.waitForTransactionReceipt({ hash: mHash })
      setMintTx(mHash)
      patchEntry(entryId, { mintTx: mHash, mintUrl: dest.scan + mHash, status: "complete" })
      setStep("Done. USDC bridged " + source.name + " to " + dest.name + " via Circle CCTP V2.")
    } catch (e: any) {
      if (entryId) patchEntry(entryId, { status: "error" })
      setErr((e && (e.shortMessage || e.message)) || "Transaction failed")
      setStep("")
    }
    setBusy(false)
  }

  const wrap: any = { border: "1px solid #39e01455", borderRadius: 14, padding: "18px 16px", margin: "18px 0", background: "rgba(5,12,5,.55)" }
  const head: any = { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }
  const title: any = { color: "#39e014", fontWeight: 800, fontSize: 17, letterSpacing: ".5px" }
  const note: any = { color: "#8aa98a", fontSize: 12, marginTop: 10, lineHeight: 1.5 }
  const row: any = { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #39e01422", fontSize: 14 }
  const lbl: any = { color: "#7fd87f", letterSpacing: ".5px", fontSize: 13, display: "block", marginTop: 10 }
  const val: any = { color: "#d6ffd6", fontFamily: "monospace" }
  const sel: any = { width: "100%", boxSizing: "border-box", background: "#020802", color: "#d6ffd6", border: "1px solid #39e01455", borderRadius: 10, padding: "12px 12px", fontSize: 15, marginTop: 6, marginBottom: 6 }
  const swapBtn: any = { width: "100%", background: "transparent", color: "#39e014", border: "1px solid #39e01455", borderRadius: 10, padding: "10px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 8, marginBottom: 4 }
  const inp: any = { width: "100%", boxSizing: "border-box", background: "#020802", color: "#d6ffd6", border: "1px solid #39e01455", borderRadius: 10, padding: "12px 12px", fontSize: 15, marginTop: 6, marginBottom: 12 }
  const btn: any = { width: "100%", background: "#39e014", color: "#041006", border: "none", borderRadius: 10, padding: "14px 18px", fontWeight: 800, fontSize: 15, cursor: "pointer" }
  const link: any = { color: "#39e014", textDecoration: "none", fontFamily: "monospace" }
  const ok: any = { color: "#39e014", fontSize: 13, marginTop: 10, lineHeight: 1.5 }
  const errStyle: any = { color: "#ff6b6b", fontSize: 13, marginTop: 10, lineHeight: 1.5 }
  const histHead: any = { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, marginBottom: 4 }
  const histTitle: any = { color: "#7fd87f", letterSpacing: ".5px", fontSize: 13, fontWeight: 700 }
  const clearBtn: any = { background: "transparent", color: "#8aa98a", border: "1px solid #39e01433", borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer" }
  const histItem: any = { padding: "8px 0", borderBottom: "1px solid #39e01422", fontSize: 12 }
  const histTop: any = { display: "flex", justifyContent: "space-between", color: "#d6ffd6" }
  const histMeta: any = { color: "#8aa98a", fontSize: 11, marginTop: 2 }
  const histLinks: any = { display: "flex", gap: 14, marginTop: 4 }
  const statusColor = (s: string): string => (s === "complete" ? "#39e014" : s === "error" ? "#ff6b6b" : "#e0c14a")

  return (
    <div style={wrap}>
      <div style={head}><span style={title}>{"\u2726"} USDC BRIDGE {DASH} CCTP V2</span></div>
      <p style={note}>Native burn-and-mint via Circle CCTP V2 between any two of six supported testnets, in any direction, including routes that never touch Arc. No wrapped tokens, no liquidity pool, no custodian. Every step is signed by your own connected wallet {DASH} Cronus never holds your key. You need source-chain USDC and a little native gas.</p>
        <label style={lbl}>INTENT {DASH} PLAIN LANGUAGE</label>
        <input
          style={inp}
          value={intentText}
          onChange={(e) => setIntentText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") readIntent() }}
          placeholder="bridge 5 usdc from base to arc"
          disabled={busy}
        />
        <p style={note}>Parsed by a deterministic allowlist, not by a language model, so the same sentence always yields the same decision. English, Russian, Spanish, Portuguese, French and German are understood. Nothing is signed or sent by this box.</p>
        <button style={btn} onClick={readIntent} disabled={busy || !intentText.trim()}>Read intent</button>
        {plan && (
          <div style={{ border: "1px solid #39e01433", borderRadius: 8, padding: 10, marginTop: 10 }}>
            <div style={row}><span style={lbl}>PARSED</span><span style={val}>{planSummary(plan)}</span></div>
            <div style={row}><span style={lbl}>LANGUAGE</span><span style={val}>{plan.lang}</span></div>
            {judged(plan) && (
              <div style={row}><span style={lbl}>DECISION</span><span style={val}>{plan.allow ? "allowed by policy" : "refused by policy"}</span></div>
            )}
            {judged(plan) && plan.reasons.length > 0 && (
              <div style={row}><span style={lbl}>REASONS</span><span style={val}>{plan.reasons.join(", ")}</span></div>
            )}
            {judged(plan) && plan.missing.length > 0 && (
              <div style={row}><span style={lbl}>MISSING</span><span style={val}>{plan.missing.join(", ")}</span></div>
            )}
            {!judged(plan) && (
              <p style={note}>Understood. The spending caps and the recipient check need a connected wallet, so no decision is claimed here.</p>
            )}
            {plan.parsed.ok && plan.parsed.kind === "swap" && (
              <p style={note}>Conversion intents are parsed and judged, but USDC to USYC conversion is not wired into this widget yet.</p>
            )}
            {canApply(plan) && (
              <button style={btn} onClick={applyPlan} disabled={busy}>Load this route into the form</button>
            )}
          </div>
        )}
        <label style={lbl}>FROM</label>
        <select style={sel} value={fromKey} onChange={(e) => setFromKey(e.target.value)} disabled={busy}>
          {ALL_CHAINS.map((c) => (<option key={c.key} value={c.key}>{c.name}</option>))}
        </select>
        <label style={lbl}>TO</label>
        <select style={sel} value={toKey} onChange={(e) => setToKey(e.target.value)} disabled={busy}>
          {ALL_CHAINS.map((c) => (<option key={c.key} value={c.key}>{c.name}</option>))}
        </select>
        <div style={row}><span style={lbl}>ROUTE</span><span style={val}>{source.name + " " + ARROW + " " + dest.name}</span></div>
        <div style={row}><span style={lbl}>ROUTE STATUS</span><span style={val}>{routeVerified ? "executed on-chain by Cronus" : "routable via CCTP V2, not yet executed by us"}</span></div>
        <button style={swapBtn} onClick={() => { const f = fromKey; setFromKey(toKey); setToKey(f) }} disabled={busy}>{SWAP + " Reverse route"}</button>
        {sameNetwork && <p style={errStyle}>Source and destination must be different networks.</p>}
      <div style={row}><span style={lbl}>RECIPIENT ({dest.name})</span><span style={val}>{address ? shorten(address) : "connect wallet"}</span></div>
      <label style={lbl}>AMOUNT (USDC)</label>
      <input style={inp} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      <button style={btn} onClick={bridge} disabled={busy || sameNetwork}>{busy ? (step || "Working" + DASH) : ("Bridge " + source.name + " " + ARROW + " " + dest.name)}</button>
      {step && !busy && <p style={ok}>{step}</p>}
      {burnTx && <div style={row}><span style={lbl}>BURN TX</span><a style={link} href={source.scan + burnTx} target="_blank" rel="noreferrer">{shorten(burnTx)}</a></div>}
      {mintTx && <div style={row}><span style={lbl}>MINT TX</span><a style={link} href={dest.scan + mintTx} target="_blank" rel="noreferrer">{shorten(mintTx)}</a></div>}
      {err && <p style={errStyle}>{err}</p>}
      {history.length > 0 && (
        <div>
          <div style={histHead}>
            <span style={histTitle}>HISTORY ({history.length})</span>
            <button style={clearBtn} onClick={clearHistory} disabled={busy}>Clear</button>
          </div>
          {history.map((h) => (
            <div key={h.id} style={histItem}>
              <div style={histTop}>
                <span style={val}>{h.route}</span>
                <span style={{ color: statusColor(h.status), fontWeight: 700 }}>{h.amount + " USDC " + DASH + " " + h.status}</span>
              </div>
              <div style={histMeta}>{fmtTime(h.id)}</div>
              <div style={histLinks}>
                {h.burnUrl && <a style={link} href={h.burnUrl} target="_blank" rel="noreferrer">burn {shorten(h.burnTx)}</a>}
                {h.mintUrl && <a style={link} href={h.mintUrl} target="_blank" rel="noreferrer">mint {shorten(h.mintTx)}</a>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
