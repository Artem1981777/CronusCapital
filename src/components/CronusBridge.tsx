import { useState } from "react"
import { useAccount, useWriteContract, usePublicClient, useChainId, useSwitchChain } from "wagmi"

// Base Sepolia -> Arc Testnet USDC bridge via Circle CCTP V2 (burn-and-mint).
// Non-custodial: every tx is signed by the visitor's own connected wallet.
// Contract addresses: https://developers.circle.com/cctp/references/contract-addresses
const BASE_SEPOLIA_ID = 84532
const ARC_ID = 5042002
const BASE_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
const TOKEN_MESSENGER_V2 = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA"
const MESSAGE_TRANSMITTER_V2 = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275"
const BASE_DOMAIN = 6
const ARC_DOMAIN = 26
const IRIS = "https://iris-api-sandbox.circle.com"
const BASESCAN = "https://sepolia.basescan.org/tx/"
const ARCSCAN = "https://testnet.arcscan.app/tx/"
const ZERO32 = "0x0000000000000000000000000000000000000000000000000000000000000000"
const DASH = "\u2014"

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

export default function CronusBridge() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const baseClient = usePublicClient({ chainId: BASE_SEPOLIA_ID })
  const arcClient = usePublicClient({ chainId: ARC_ID })

  const [amount, setAmount] = useState("1")
  const [step, setStep] = useState("")
  const [burnTx, setBurnTx] = useState("")
  const [mintTx, setMintTx] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  async function bridge() {
    setErr(""); setBurnTx(""); setMintTx(""); setStep("")
    if (!isConnected || !address) { setErr("Connect your wallet first (button at top)."); return }
    if (!baseClient || !arcClient) { setErr("RPC client unavailable."); return }
    const amt = toUnits(amount, 6)
    if (amt <= 0n) { setErr("Enter an amount greater than 0."); return }
    setBusy(true)
    try {
      if (chainId !== BASE_SEPOLIA_ID) {
        setStep("Switching wallet to Base Sepolia" + DASH)
        await switchChainAsync({ chainId: BASE_SEPOLIA_ID })
      }
      const maxFee = amt / 100n
      const bal = await baseClient.readContract({ address: BASE_USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }) as bigint
      if (bal < amt) throw new Error("Insufficient Base Sepolia USDC balance. Fund this wallet at faucet.circle.com and retry.")
      setStep("1/4 Approving USDC on Base Sepolia" + DASH)
      const approveHash = await writeContractAsync({
        chainId: BASE_SEPOLIA_ID,
        address: BASE_USDC,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [TOKEN_MESSENGER_V2, amt],
      } as any)
      await baseClient.waitForTransactionReceipt({ hash: approveHash })
      for (let i = 0; i < 10; i++) {
        const a = await baseClient.readContract({ address: BASE_USDC, abi: ERC20_ABI, functionName: "allowance", args: [address, TOKEN_MESSENGER_V2] }) as bigint
        if (a >= amt) break
        await sleep(1500)
      }
      setStep("2/4 Burning USDC on Base Sepolia (CCTP V2)" + DASH)
      await baseClient.simulateContract({ account: address, chainId: BASE_SEPOLIA_ID, address: TOKEN_MESSENGER_V2, abi: TM_ABI, functionName: "depositForBurn", args: [amt, ARC_DOMAIN, addrToBytes32(address), BASE_USDC, ZERO32, maxFee, 1000] } as any)
      const bHash = await writeContractAsync({
        chainId: BASE_SEPOLIA_ID,
        address: TOKEN_MESSENGER_V2,
        abi: TM_ABI,
        functionName: "depositForBurn",
        args: [amt, ARC_DOMAIN, addrToBytes32(address), BASE_USDC, ZERO32, maxFee, 1000],
      } as any)
      await baseClient.waitForTransactionReceipt({ hash: bHash })
      setBurnTx(bHash)
      setStep("3/4 Waiting for Circle attestation" + DASH)
      let msg: any = null
      for (let i = 0; i < 60; i++) {
        try {
          const r = await fetch(IRIS + "/v2/messages/" + BASE_DOMAIN + "?transactionHash=" + bHash)
          if (r.ok) {
            const j = await r.json()
            const m = j && j.messages && j.messages[0]
            if (m && m.status === "complete" && m.attestation && m.attestation !== "PENDING") { msg = m; break }
          }
        } catch { /* retry */ }
        await sleep(5000)
      }
      if (!msg) throw new Error("Attestation timed out. Your burn is safe; the mint can be completed later with the burn tx.")
      setStep("4/4 Minting on Arc Testnet" + DASH)
      await switchChainAsync({ chainId: ARC_ID })
      const mHash = await writeContractAsync({
        chainId: ARC_ID,
        address: MESSAGE_TRANSMITTER_V2,
        abi: MT_ABI,
        functionName: "receiveMessage",
        args: [msg.message, msg.attestation],
      } as any)
      await arcClient.waitForTransactionReceipt({ hash: mHash })
      setMintTx(mHash)
      setStep("Done. USDC bridged Base Sepolia to Arc Testnet via Circle CCTP V2.")
    } catch (e: any) {
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
  const lbl: any = { color: "#7fd87f", letterSpacing: ".5px", fontSize: 13 }
  const val: any = { color: "#d6ffd6", fontFamily: "monospace" }
  const inp: any = { width: "100%", boxSizing: "border-box", background: "#020802", color: "#d6ffd6", border: "1px solid #39e01455", borderRadius: 10, padding: "12px 12px", fontSize: 15, marginTop: 6, marginBottom: 12 }
  const btn: any = { width: "100%", background: "#39e014", color: "#041006", border: "none", borderRadius: 10, padding: "14px 18px", fontWeight: 800, fontSize: 15, cursor: "pointer" }
  const link: any = { color: "#39e014", textDecoration: "none", fontFamily: "monospace" }
  const ok: any = { color: "#39e014", fontSize: 13, marginTop: 10, lineHeight: 1.5 }
  const errStyle: any = { color: "#ff6b6b", fontSize: 13, marginTop: 10, lineHeight: 1.5 }

  return (
    <div style={wrap} id="cap-bridge">
      <div style={head}><span style={title}>{"\u21CC"} USDC BRIDGE {DASH} BASE SEPOLIA TO ARC (CCTP V2)</span></div>
      <p style={note}>Native burn-and-mint via Circle CCTP V2. No wrapped tokens, no liquidity pool, no custodian. Every step is signed by your own connected wallet {DASH} Cronus never holds your key. You need Base Sepolia USDC and a little Base Sepolia ETH for gas.</p>
      <div style={row}><span style={lbl}>ROUTE</span><span style={val}>Base Sepolia {"\u2192"} Arc Testnet</span></div>
      <div style={row}><span style={lbl}>RECIPIENT</span><span style={val}>{address ? shorten(address) : "connect wallet"}</span></div>
      <label style={lbl}>AMOUNT (USDC)</label>
      <input style={inp} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      <button style={btn} onClick={bridge} disabled={busy}>{busy ? (step || "Working" + DASH) : "Bridge USDC to Arc"}</button>
      {step && !busy && <p style={ok}>{step}</p>}
      {burnTx && <div style={row}><span style={lbl}>BURN TX (Base)</span><a style={link} href={BASESCAN + burnTx} target="_blank" rel="noreferrer">{shorten(burnTx)}</a></div>}
      {mintTx && <div style={row}><span style={lbl}>MINT TX (Arc)</span><a style={link} href={ARCSCAN + mintTx} target="_blank" rel="noreferrer">{shorten(mintTx)}</a></div>}
      {err && <p style={errStyle}>{err}</p>}
    </div>
  )
}
