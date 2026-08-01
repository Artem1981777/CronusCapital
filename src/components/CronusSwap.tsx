import { useState } from "react"
import { useAccount, useWriteContract, usePublicClient, useChainId, useSwitchChain } from "wagmi"
import { parseAbi, parseUnits, formatUnits } from "viem"
import { evaluateIntent } from "../../lib/intentPolicyCore.js"

// Swap against the Cronus AMM on Arc: contracts/CronusSwap.sol, deployed and funded by us.
//
// This is not an integration with a third-party DEX, because Arc testnet has none. It is our
// own constant-product pool holding our own liquidity, and the interface says so out loud.
// USYC is deliberately absent: it is permissioned, the entitlements contract answers false
// for us, so quoting it here would be theatre.

type Hex = `0x${string}`

const ARC_CHAIN_ID = 5042002
const SCAN = "https://testnet.arcscan.app/tx/"
const USDC: Hex = "0x3600000000000000000000000000000000000000"
const CRN: Hex = "0x352991E7Ba195DcB2AdAC9128B88cD3bd80E53C9"
const POOL: Hex = "0x1c1dE1f341823cdB13bF8f8669ceB8167d8a1c32"

const POOL_ABI = parseAbi([
  "function quote(address tokenIn, uint256 amountIn) view returns (uint256)",
  "function swapExactIn(address tokenIn, uint256 amountIn, uint256 minOut, address to) returns (uint256)",
  "function reserveA() view returns (uint256)",
  "function reserveB() view returns (uint256)",
])
const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
])

const HKEY = "cronus_swap_history_v1"
const ARROW = "\u2192"

type Entry = {
  id: number
  dir: string
  amountIn: string
  amountOut: string
  tx: string
  status: string
}

function loadHistory(): Entry[] {
  try { return JSON.parse(localStorage.getItem(HKEY) || "[]") } catch { return [] }
}
// Stored as a timestamp, not a formatted string, so the clock can be corrected later
// without rewriting what is already saved.
function fmtTime(id: number): string {
  try { return new Date(id).toISOString().replace("T", " ").slice(0, 19) + " UTC" } catch { return "" }
}
function shorten(h: string): string { return h.slice(0, 8) + "\u2026" + h.slice(-6) }

export function CronusSwap() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient({ chainId: ARC_CHAIN_ID })

  const [sellCrn, setSellCrn] = useState(false)
  const [amount, setAmount] = useState("")
  const [quoted, setQuoted] = useState<{ inAtomic: bigint; out: bigint } | null>(null)
  const [slippage, setSlippage] = useState("1")
  const [reserves, setReserves] = useState<string>("")
  const [tx, setTx] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  const [intentText, setIntentText] = useState("")
  const [plan, setPlan] = useState<any>(null)
  const [history, setHistory] = useState<Entry[]>(loadHistory)

  const tokenIn: Hex = sellCrn ? CRN : USDC
  const inName = sellCrn ? "CRN" : "USDC"
  const outName = sellCrn ? "USDC" : "CRN"

  function pushEntry(e: Entry) {
    const next = [e, ...history].slice(0, 25)
    setHistory(next)
    try { localStorage.setItem(HKEY, JSON.stringify(next)) } catch { /* private mode */ }
  }

  function readIntent() {
    setErr("")
    const d: any = evaluateIntent(intentText, { sender: address || undefined })
    setPlan(d)
    const p = d?.parsed
    if (p?.ok && p.kind === "swap" && p.pairTradeable) {
      setSellCrn(p.fromToken === "crn")
      if (p.amount) setAmount(String(p.amount))
      setQuoted(null)
    }
  }

  async function getQuote() {
    setErr(""); setTx(""); setQuoted(null)
    if (!client) { setErr("No Arc client"); return }
    let inAtomic: bigint
    try { inAtomic = parseUnits(amount || "0", 6) } catch { setErr("Bad amount"); return }
    if (inAtomic <= 0n) { setErr("Amount must be positive"); return }
    setBusy(true)
    try {
      const out = await client.readContract({
        address: POOL, abi: POOL_ABI, functionName: "quote", args: [tokenIn, inAtomic],
      }) as bigint
      const [rA, rB] = await Promise.all([
        client.readContract({ address: POOL, abi: POOL_ABI, functionName: "reserveA" }) as Promise<bigint>,
        client.readContract({ address: POOL, abi: POOL_ABI, functionName: "reserveB" }) as Promise<bigint>,
      ])
      setQuoted({ inAtomic, out })
      setReserves(formatUnits(rA, 6) + " USDC / " + formatUnits(rB, 6) + " CRN")
    } catch (e: any) {
      setErr(String(e?.shortMessage || e?.message || e).slice(0, 200))
    } finally { setBusy(false) }
  }

  async function doSwap() {
    if (!quoted || !address) return
    setErr(""); setTx("")
    setBusy(true)
    try {
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
      if (!client) throw new Error("No Arc client")

      // minOut is computed from the quote the user actually saw, not re-read at send time.
      // If the pool moved in between, the transaction reverts instead of filling silently.
      const bps = BigInt(Math.max(0, Math.min(5000, Math.round(Number(slippage || "1") * 100))))
      const minOut = (quoted.out * (10000n - bps)) / 10000n

      const allowance = await client.readContract({
        address: tokenIn, abi: ERC20_ABI, functionName: "allowance", args: [address, POOL],
      }) as bigint
      if (allowance < quoted.inAtomic) {
        const ah = await writeContractAsync({
          address: tokenIn, abi: ERC20_ABI, functionName: "approve",
          args: [POOL, quoted.inAtomic], chainId: ARC_CHAIN_ID,
        })
        await client.waitForTransactionReceipt({ hash: ah })
      }

      const h = await writeContractAsync({
        address: POOL, abi: POOL_ABI, functionName: "swapExactIn",
        args: [tokenIn, quoted.inAtomic, minOut, address], chainId: ARC_CHAIN_ID,
      })
      setTx(h)
      const rc = await client.waitForTransactionReceipt({ hash: h })
      pushEntry({
        id: Date.now(),
        dir: inName + " " + ARROW + " " + outName,
        amountIn: formatUnits(quoted.inAtomic, 6),
        amountOut: formatUnits(quoted.out, 6),
        tx: h,
        status: rc.status === "success" ? "complete" : "failed",
      })
      setQuoted(null)
    } catch (e: any) {
      setErr(String(e?.shortMessage || e?.message || e).slice(0, 240))
    } finally { setBusy(false) }
  }

  const p = plan?.parsed
  const planLine = !plan ? "" :
    p?.ok && p.kind === "swap" && p.pairTradeable ? "swap " + p.amount + " " + p.fromToken + " " + ARROW + " " + p.toToken :
    p?.ok && p.kind === "swap" ? "understood, but " + p.fromToken + " " + ARROW + " " + p.toToken + " is not tradeable here" :
    p?.ok ? "not a swap: " + p.kind :
    "no executable plan" + (p?.reasons?.length ? " (" + p.reasons.join(", ") + ")" : "")

  return (
    <div style={wrap}>
      <div style={head}>
        <span style={title}>&#10003; SWAP &#8212; CRONUS AMM ON ARC</span>
      </div>
      <p style={note}>
        A constant-product pool we wrote and deployed ourselves (<code>contracts/CronusSwap.sol</code>),
        holding our own liquidity in native Arc USDC against CRN, a fixed-supply test token. Arc testnet
        has no DEX, so this is not an integration with one. Pricing is {"x \u00D7 y = k"} with a 0.3% fee,
        the pool is thin on purpose, and large orders will visibly move the price. USYC is absent because
        it is permissioned and the entitlements contract answers false for us.
      </p>

      <label style={lbl}>INTENT &#8212; PLAIN LANGUAGE</label>
      <div style={row}>
        <input style={inp} value={intentText} placeholder="swap 1 usdc for crn"
          onChange={(e) => setIntentText(e.target.value)} />
        <button style={btn} onClick={readIntent} disabled={busy}>Read intent</button>
      </div>
      {plan && <p style={note}>PARSED {planLine}</p>}

      <div style={row}>
        <div>
          <label style={lbl}>SELL</label>
          <div style={val}>{inName}</div>
        </div>
        <button style={swapBtn} onClick={() => { setSellCrn(!sellCrn); setQuoted(null) }} disabled={busy}>
          &#8646; Flip
        </button>
        <div>
          <label style={lbl}>RECEIVE</label>
          <div style={val}>{outName}</div>
        </div>
      </div>

      <label style={lbl}>AMOUNT ({inName})</label>
      <input style={inp} value={amount} placeholder="0.1"
        onChange={(e) => { setAmount(e.target.value); setQuoted(null) }} />

      <label style={lbl}>SLIPPAGE TOLERANCE (%)</label>
      <input style={inp} value={slippage} onChange={(e) => setSlippage(e.target.value)} />

      <button style={btn} onClick={getQuote} disabled={busy || !amount}>
        {busy ? "\u2026" : "Get quote from pool"}
      </button>

      {quoted && (
        <div style={{ marginTop: 12 }}>
          <p style={val}>
            {formatUnits(quoted.inAtomic, 6)} {inName} {ARROW} {formatUnits(quoted.out, 6)} {outName}
          </p>
          <p style={note}>Pool reserves: {reserves}</p>
          <button style={btn} onClick={doSwap} disabled={busy || !isConnected}>
            {isConnected ? "Swap " + inName + " " + ARROW + " " + outName : "Connect a wallet to swap"}
          </button>
        </div>
      )}

      {tx && <p style={ok}>Sent: <a style={link} href={SCAN + tx} target="_blank" rel="noreferrer">{shorten(tx)}</a></p>}
      {err && <p style={errStyle}>{err}</p>}

      {history.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={histHead}>
            <span style={histTitle}>HISTORY ({history.length})</span>
            <button style={clearBtn} onClick={() => { setHistory([]); localStorage.removeItem(HKEY) }}>Clear</button>
          </div>
          {history.map((h) => (
            <div key={h.id} style={histItem}>
              <div style={histTop}>{h.dir} &#8212; {h.amountIn} {ARROW} {h.amountOut} ({h.status})</div>
              <div style={histMeta}>{fmtTime(h.id)}</div>
              <div style={histLinks}>
                <a style={link} href={SCAN + h.tx} target="_blank" rel="noreferrer">tx {shorten(h.tx)}</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const GREEN = "#39e014"
const wrap: React.CSSProperties = { padding: 16, fontFamily: "ui-monospace, monospace", color: GREEN }
const head: React.CSSProperties = { marginBottom: 10 }
const title: React.CSSProperties = { fontWeight: 700, letterSpacing: 1 }
const note: React.CSSProperties = { opacity: 0.75, fontSize: 12, lineHeight: 1.5, margin: "8px 0" }
const lbl: React.CSSProperties = { display: "block", fontSize: 11, opacity: 0.7, marginTop: 12, letterSpacing: 1 }
const row: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }
const val: React.CSSProperties = { fontSize: 14, fontWeight: 700 }
const inp: React.CSSProperties = { background: "transparent", border: "1px solid " + GREEN, color: GREEN, padding: "8px 10px", fontFamily: "inherit", flex: 1, minWidth: 120 }
const btn: React.CSSProperties = { background: "transparent", border: "1px solid " + GREEN, color: GREEN, padding: "8px 12px", cursor: "pointer", fontFamily: "inherit", marginTop: 10 }
const swapBtn: React.CSSProperties = { background: "transparent", border: "1px solid " + GREEN, color: GREEN, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit" }
const ok: React.CSSProperties = { fontSize: 12, marginTop: 10 }
const link: React.CSSProperties = { color: GREEN, textDecoration: "underline" }
const errStyle: React.CSSProperties = { color: "#ff6b6b", fontSize: 12, marginTop: 10, wordBreak: "break-word" }
const histHead: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center" }
const histTitle: React.CSSProperties = { fontWeight: 700, letterSpacing: 1 }
const clearBtn: React.CSSProperties = { background: "transparent", border: "1px solid " + GREEN, color: GREEN, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit", fontSize: 11 }
const histItem: React.CSSProperties = { borderTop: "1px solid rgba(57,224,20,0.25)", padding: "8px 0" }
const histTop: React.CSSProperties = { fontSize: 13 }
const histMeta: React.CSSProperties = { fontSize: 11, opacity: 0.6 }
const histLinks: React.CSSProperties = { fontSize: 11, marginTop: 4 }

export default CronusSwap
