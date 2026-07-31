import { useState } from "react"
import { useAccount, useWriteContract, usePublicClient, useChainId, useSwitchChain } from "wagmi"

// Arc Testnet <-> EVM testnets USDC bridge via Circle CCTP V2 (burn-and-mint), either direction.
// Non-custodial: every tx is signed by the visitor's own connected wallet.
// Addresses verified against https://developers.circle.com/cctp/references/contract-addresses
type Hex = `0x${string}`

// V2 contracts are identical across all supported EVM testnets (including Arc).
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
function fmtTime(id: number): string { try { return new Date(id).toLocaleString() } catch { return "" } }

export default function CronusBridge() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const [chainKey, setChainKey] = useState("base")
  const [toArc, setToArc] = useState(true)
  const cp = CHAINS.find((c) => c.key === chainKey) || CHAINS[0]
  const source = toArc ? cp : ARC
  const dest = toArc ? ARC : cp
  const sourceClient = usePublicClient({ chainId: source.chainId })
  const destClient = usePublicClient({ chainId: dest.chainId })
  const [amount, setAmount] = useState("1")
  const [step, setStep] = useState("")
  const [burnTx, setBurnTx] = useState("")
  const [mintTx, setMintTx] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<Entry[]>(loadHistory)

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
    const amt = toUnits(amount, 6)
    if (amt <= 0n) { setErr("Enter an amount greater than 0."); return }
    const route = source.name + " " + ARROW + " " + dest.name
    let entryId = 0
    setBusy(true)
    try {
      if (chainId !== source.chainId) {
        setStep("Switching wallet to " + source.name + DASH)
        await switchChainAsync({ chainId: source.chainId })
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
      await switchChainAsync({ chainId: dest.chainId })
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
      <p style={note}>Native burn-and-mint via Circle CCTP V2 between Arc Testnet and major EVM testnets, in either direction. No wrapped tokens, no liquidity pool, no custodian. Every step is signed by your own connected wallet {DASH} Cronus never holds your key. You need source-chain USDC and a little native gas.</p>
      <label style={lbl}>PAIRED NETWORK</label>
      <select style={sel} value={chainKey} onChange={(e) => setChainKey(e.target.value)} disabled={busy}>
        {CHAINS.map((c) => (<option key={c.key} value={c.key}>{c.name}</option>))}
      </select>
      <div style={row}><span style={lbl}>ROUTE</span><span style={val}>{source.name + " " + ARROW + " " + dest.name}</span></div>
      <button style={swapBtn} onClick={() => setToArc((v) => !v)} disabled={busy}>{SWAP + " Swap direction"}</button>
      <div style={row}><span style={lbl}>RECIPIENT ({dest.name})</span><span style={val}>{address ? shorten(address) : "connect wallet"}</span></div>
      <label style={lbl}>AMOUNT (USDC)</label>
      <input style={inp} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      <button style={btn} onClick={bridge} disabled={busy}>{busy ? (step || "Working" + DASH) : ("Bridge " + source.name + " " + ARROW + " " + dest.name)}</button>
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
