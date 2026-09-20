import { useEffect, useState } from "react"
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import { cronusGuestbookAbi } from "../contracts/cronusGuestbookArtifact"
import { ensureChain } from "../lib/chains"

const ARC_CHAIN_ID = 5042
const EXPLORER = "https://explorer.arc.io"
const GUESTBOOK_ADDRESS = "0xCcC23DaC8FCE10B4F957DC761115D6B9Ce397DB4" as `0x${string}`

interface Note { author: string; message: string; isAgent: boolean; timestamp: bigint }

export default function GuestbookWall() {
  const { address, isConnected, connector } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const client = usePublicClient({ chainId: ARC_CHAIN_ID })
  const { writeContractAsync, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState("")
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(false)
  const onArc = chainId === ARC_CHAIN_ID

  async function loadNotes() {
    if (!client) return
    setLoading(true)
    try {
      const result = await client.readContract({
        address: GUESTBOOK_ADDRESS,
        abi: cronusGuestbookAbi,
        functionName: "getRecentNotes",
        args: [30n],
      })
      setNotes(result as unknown as Note[])
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { loadNotes() }, [client])
  useEffect(() => { if (isSuccess) loadNotes() }, [isSuccess])

  async function leaveNote() {
    reset()
    setStatus("")
    if (!isConnected) { setStatus("Connect a wallet first."); return }
    if (!message.trim()) return
    if (!onArc) {
      try { await ensureChain(ARC_CHAIN_ID, { switchChainAsync, getProvider: () => connector?.getProvider?.() }) }
      catch (e) { setStatus(e instanceof Error ? e.message : "Network switch was rejected."); return }
    }
    try {
      setStatus("Review the note in your wallet.")
      await writeContractAsync({
        chainId: ARC_CHAIN_ID,
        address: GUESTBOOK_ADDRESS,
        abi: cronusGuestbookAbi,
        functionName: "leaveNote",
        args: [message.trim()],
      })
      setStatus("Note submitted. Waiting for Arc confirmation…")
      setMessage("")
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Transaction was rejected.")
    }
  }

  const disabled = !isConnected || isPending || isConfirming || !message.trim() || message.length > 280

  return (
    <section className="cd-deploy-card" aria-label="Cronus public guestbook" style={{ marginTop: 20 }}>
      <div className="cd-sb-deploy-title">𓂀 PUBLIC GUESTBOOK</div>
      <div className="cd-sb-deploy-copy">A shared on-chain wall. Anyone connected can leave a short note — permanently recorded on Arc Mainnet, no owner, no moderation. Notes from addresses registered in the Cronus identity registry are flagged AGENT.</div>
      <input className="cd-sb-deploy-input" value={message} maxLength={280} onChange={(e) => setMessage(e.target.value)} placeholder="Leave a public note (max 280 chars)…" aria-label="Guestbook note" />
      <button className="cd-sb-deploy-btn" onClick={leaveNote} disabled={disabled}>
        {isPending ? "CONFIRM IN WALLET" : isConfirming ? "CONFIRMING…" : "LEAVE NOTE"}
      </button>
      <div className="cd-sb-deploy-meta">One note per wallet every 30s · gas paid in native USDC</div>
      {status && <div className="cd-sb-deploy-status">{status}</div>}
      {error && !status && <div className="cd-sb-deploy-status bad">{error.message}</div>}
      {hash && <a className="cd-sb-deploy-link" href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}
      {address && <div className="cd-sb-deploy-meta">Posting as: {address.slice(0, 6)}…{address.slice(-4)}</div>}

      <div className="cd-deploy-history" style={{ marginTop: 16 }}>
        <div className="cd-deploy-history-head">
          <span>RECENT NOTES</span>
          <button className="cd-deploy-clear" onClick={loadNotes}>{loading ? "…" : "REFRESH"}</button>
        </div>
        {notes.length === 0 && <div className="cd-deploy-empty">No notes yet — be the first.</div>}
        {notes.map((n, i) => (
          <div key={i} className="cd-deploy-item">
            <div className="cd-deploy-item-row" style={{ marginBottom: 4 }}>
              <a href={`${EXPLORER}/address/${n.author}`} target="_blank" rel="noreferrer">{n.author.slice(0, 6)}…{n.author.slice(-4)}</a>
              {n.isAgent && <span className="cd-sb-badge gold" style={{ marginLeft: 8 }}>AGENT</span>}
            </div>
            <div className="cd-deploy-item-msg">{n.message}</div>
            <div className="cd-deploy-item-time">{new Date(Number(n.timestamp) * 1000).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
