import { useState, useEffect } from "react"
import { useAccount, useWriteContract, usePublicClient } from "wagmi"

const ARC_USDC = "0x3600000000000000000000000000000000000000"
const ARC_TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA"
const STELLAR_FORWARDER = "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ"
const STELLAR_DOMAIN = 27
const KEY = "cronus_stellar_addr"
const SCHEME = "https://"
const ARCSCAN = SCHEME + "testnet.arcscan" + ".app/tx/"
const DASH = "\u2014"
const STAR = "\u2726"

const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
]
const TM_ABI = [
  { type: "function", name: "depositForBurnWithHook", stateMutability: "nonpayable", inputs: [
    { name: "amount", type: "uint256" },
    { name: "destinationDomain", type: "uint32" },
    { name: "mintRecipient", type: "bytes32" },
    { name: "burnToken", type: "address" },
    { name: "destinationCaller", type: "bytes32" },
    { name: "maxFee", type: "uint256" },
    { name: "minFinalityThreshold", type: "uint32" },
    { name: "hookData", type: "bytes" },
  ], outputs: [] },
]

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
function base32Decode(s: string) {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of s) {
    const idx = B32.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((value >> bits) & 0xff)
    }
  }
  return new Uint8Array(out)
}
function toHex(bytes: Uint8Array) {
  let h = ""
  for (const b of bytes) h += b.toString(16).padStart(2, "0")
  return h
}
function strkeyToBytes32(strkey: string) {
  const raw = base32Decode(strkey.trim())
  const payload = raw.slice(1, 33)
  return "0x" + toHex(payload)
}
function buildHookData(gAddr: string) {
  const rb = new TextEncoder().encode(gAddr.trim())
  const buf = new Uint8Array(32 + rb.length)
  const L = rb.length
  buf[28] = (L >>> 24) & 0xff
  buf[29] = (L >>> 16) & 0xff
  buf[30] = (L >>> 8) & 0xff
  buf[31] = L & 0xff
  buf.set(rb, 32)
  return "0x" + toHex(buf)
}
function toUnits(amount: string, decimals: number) {
  const s = amount.trim()
  if (!s) return 0n
  const parts = s.split(".")
  const whole = parts[0] || "0"
  let frac = parts[1] || ""
  frac = (frac + "0".repeat(decimals)).slice(0, decimals)
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(frac || "0")
}
function shorten(a: string) {
  if (!a) return ""
  return a.slice(0, 6) + "\u2026" + a.slice(-6)
}

export default function StellarBurn() {
  const { address, isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()
  const [dest, setDest] = useState("")
  const [amount, setAmount] = useState("1")
  const [step, setStep] = useState("")
  const [burnTx, setBurnTx] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY) || ""
      if (saved) setDest(saved)
    } catch {}
    function onAddr(e: Event) { setDest((e as CustomEvent<string>).detail || "") }
    function onStorage(e: StorageEvent) { if (e.key === KEY) setDest(e.newValue || "") }
    window.addEventListener("cronus:stellar-addr", onAddr)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener("cronus:stellar-addr", onAddr)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  async function bridge() {
    setErr("")
    setBurnTx("")
    setStep("")
    if (!isConnected || !address) { setErr("Connect your Arc wallet first (button at top)"); return }
    if (!publicClient) { setErr("No RPC client available"); return }
    const g = dest.trim()
    if (!/^G[A-Z2-7]{55}$/.test(g)) { setErr("Link a valid Stellar address (G...) in the panel above first"); return }
    const amt = toUnits(amount, 6)
    if (amt <= 0n) { setErr("Enter an amount greater than 0"); return }
    setBusy(true)
    try {
      const fwd = strkeyToBytes32(STELLAR_FORWARDER)
      const hook = buildHookData(g)
      const maxFee = amt / 100n
      setStep("1/2 Approving USDC for the bridge" + DASH)
      const approveHash = await writeContractAsync({
        address: ARC_USDC,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ARC_TOKEN_MESSENGER, amt],
      } as any)
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      setStep("2/2 Burning on Arc and routing via CctpForwarder" + DASH)
      const bHash = await writeContractAsync({
        address: ARC_TOKEN_MESSENGER,
        abi: TM_ABI,
        functionName: "depositForBurnWithHook",
        args: [amt, STELLAR_DOMAIN, fwd, ARC_USDC, fwd, maxFee, 2000, hook],
      } as any)
      await publicClient.waitForTransactionReceipt({ hash: bHash })
      setBurnTx(bHash)
      setStep("Burn confirmed on Arc. Track the attestation below; it then mints and forwards to your Stellar wallet.")
    } catch (e: any) {
      setErr((e && e.shortMessage) || (e && e.message) || "Transaction failed")
      setStep("")
    }
    setBusy(false)
  }

  const wrap: any = { border: "1px solid #39e01455", borderRadius: 14, padding: "18px 16px", margin: "18px 0", background: "rgba(5,12,5,.55)" }
  const head: any = { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }
  const title: any = { color: "#39e014", fontWeight: 800, fontSize: 17, letterSpacing: ".5px" }
  const note: any = { color: "#8aa98a", fontSize: 12, marginTop: 10, lineHeight: 1.5 }
  const row: any = { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #39e01422", fontSize: 14 }
  const lbl: any = { color: "#7fd87f", letterSpacing: ".5px", fontSize: 13 }
  const val: any = { color: "#d6ffd6", fontFamily: "monospace" }
  const inp: any = { width: "100%", boxSizing: "border-box", background: "#020802", color: "#d6ffd6", border: "1px solid #39e01455", borderRadius: 10, padding: "12px 12px", fontSize: 15, marginTop: 6, marginBottom: 12 }
  const btn: any = { width: "100%", background: "#39e014", color: "#041006", border: "none", borderRadius: 10, padding: "14px 18px", fontWeight: 800, fontSize: 15, cursor: "pointer" }
  const link: any = { color: "#39e014", textDecoration: "none", fontFamily: "monospace" }
  const ok: any = { color: "#39e014", fontSize: 13, marginTop: 10, lineHeight: 1.5 }
  const errStyle: any = { color: "#ff6b6b", fontSize: 13, marginTop: 10, lineHeight: 1.5 }

  return (
    <div style={wrap}>
      <div style={head}><span style={title}>{STAR} EXECUTE REAL BURN {DASH} ARC TO STELLAR</span></div>
      <p style={note}>Burns native USDC on Arc via Circle CCTP V2 (depositForBurnWithHook) and forwards to your linked Stellar wallet through the official CctpForwarder. Real testnet transaction, signed by your Arc wallet.</p>
      <div style={row}><span style={lbl}>STELLAR RECIPIENT</span><span style={val}>{dest ? shorten(dest) : "link wallet above"}</span></div>
      <label style={lbl}>AMOUNT (USDC)</label>
      <input style={inp} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      <button style={btn} onClick={bridge} disabled={busy}>{busy ? (step || "Working" + DASH) : "Burn and Bridge to Stellar"}</button>
      {step && !busy && <p style={ok}>{step}</p>}
      {burnTx && <div style={row}><span style={lbl}>BURN TX</span><a style={link} href={ARCSCAN + burnTx} target="_blank" rel="noreferrer">{shorten(burnTx)}</a></div>}
      {burnTx && <p style={note}>Paste this tx hash into the LIVE ATTESTATION TRACKER below to watch Circle attest, then it mints and forwards on Stellar.</p>}
      {err && <p style={errStyle}>{err}</p>}
    </div>
  )
}
