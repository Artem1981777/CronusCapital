import { useEffect, useMemo, useState } from "react"
import { useAccount, useChainId, useDeployContract, useSwitchChain, useWaitForTransactionReceipt } from "wagmi"
import { cronusProofNoteAbi, cronusProofNoteBytecode } from "../contracts/cronusProofNoteArtifact"
import { ensureChain } from "../lib/chains"
import { cronusGuestbookAbi, cronusGuestbookBytecode } from "../contracts/cronusGuestbookArtifact"

const ARC_CHAIN_ID = 5042
const EXPLORER = "https://explorer.arc.io"
const IDENTITY_REGISTRY = "0x5B179bFF284a17a5C8C3ccaDed1984949B410522"
const HISTORY_KEY = "cronus.deploys.v1"

interface DeployRecord {
  hash: string
  contractAddress?: string
  message: string
  deployer: string
  timestamp: number
}

function loadHistory(): DeployRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function saveHistory(list: DeployRecord[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50))) } catch { /* ignore */ }
}

export default function ContractDeployPanel() {
  const { address, isConnected, connector } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const { deployContractAsync, data: hash, isPending, error, reset } = useDeployContract()
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const { deployContractAsync: deployGuestbookAsync, data: gbHash, isPending: gbPending, error: gbError } = useDeployContract()
  const { data: gbReceipt, isLoading: gbConfirming, isSuccess: gbSuccess } = useWaitForTransactionReceipt({ hash: gbHash })
  const [gbStatus, setGbStatus] = useState("")

  async function deployGuestbookOnce() {
    setGbStatus("")
    if (!isConnected) { setGbStatus("Connect a wallet first."); return }
    if (!onArc) {
      try { await ensureChain(ARC_CHAIN_ID, { switchChainAsync, getProvider: () => connector?.getProvider?.() }) }
      catch (e) { setGbStatus(e instanceof Error ? e.message : "Network switch was rejected."); return }
    }
    try {
      setGbStatus("Review the guestbook deployment in your wallet.")
      await deployGuestbookAsync({
        chainId: ARC_CHAIN_ID,
        abi: cronusGuestbookAbi,
        bytecode: cronusGuestbookBytecode,
        args: [IDENTITY_REGISTRY],
      })
      setGbStatus("Transaction submitted. Waiting for Arc confirmation…")
    } catch (e) {
      setGbStatus(e instanceof Error ? e.message : "Deployment was rejected.")
    }
  }
  const [message, setMessage] = useState("Cronus proof note")
  const [status, setStatus] = useState("")
  const [history, setHistory] = useState<DeployRecord[]>([])
  const [savedForHash, setSavedForHash] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)
  const onArc = chainId === ARC_CHAIN_ID
  const contractAddress = receipt?.contractAddress
  const txUrl = hash ? `${EXPLORER}/tx/${hash}` : ""
  const contractUrl = contractAddress ? `${EXPLORER}/address/${contractAddress}` : ""
  const disabled = !isConnected || switching || isPending || isConfirming || !message.trim() || message.length > 140

  useEffect(() => { setHistory(loadHistory()) }, [])

  useEffect(() => {
    if (!isSuccess || !hash || !receipt || savedForHash === hash) return
    const record: DeployRecord = {
      hash,
      contractAddress: receipt.contractAddress || undefined,
      message: message.trim(),
      deployer: address || "",
      timestamp: Date.now(),
    }
    const next = [record, ...loadHistory().filter((r) => r.hash !== hash)]
    saveHistory(next)
    setHistory(next)
    setSavedForHash(hash)
  }, [isSuccess, hash, receipt, address, message, savedForHash])

  const buttonLabel = useMemo(() => {
    if (!isConnected) return "CONNECT WALLET FIRST"
    if (switching) return "SWITCHING TO ARC…"
    if (isPending) return "CONFIRM IN WALLET"
    if (isConfirming) return "CONFIRMING…"
    if (isSuccess) return "DEPLOY ANOTHER NOTE"
    return "DEPLOY CONTRACT"
  }, [isConnected, switching, isPending, isConfirming, isSuccess])

  async function deploy() {
    reset()
    setStatus("")
    setSavedForHash(null)
    if (!isConnected) { setStatus("Connect a wallet first."); return }
    if (!onArc) {
      setSwitching(true)
      setStatus("Switching your wallet to Arc Mainnet…")
      try {
        await ensureChain(ARC_CHAIN_ID, { switchChainAsync, getProvider: () => connector?.getProvider?.() })
      } catch (e) {
        setSwitching(false)
        setStatus(e instanceof Error ? e.message : "Network switch was rejected in your wallet.")
        return
      }
      setSwitching(false)
    }
    try {
      setStatus("Review the contract deployment in your wallet.")
      await deployContractAsync({
        chainId: ARC_CHAIN_ID,
        abi: cronusProofNoteAbi,
        bytecode: cronusProofNoteBytecode,
        args: [message.trim()],
      })
      setStatus("Transaction submitted. Waiting for Arc confirmation…")
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Deployment was rejected.")
    }
  }

  function clearHistory() {
    saveHistory([])
    setHistory([])
  }

  return (
    <section className="cd-deploy-page" aria-label="Deploy a Cronus contract">
      <div className="cd-deploy-card">
        <div className="cd-sb-deploy-title">⬢ DEPLOY CONTRACT</div>
        <div className="cd-sb-deploy-copy">Deploy a real Cronus Proof Note from any connected wallet. Your wallet becomes the owner. No server key is ever used.</div>
        <input className="cd-sb-deploy-input" value={message} maxLength={140} onChange={(e) => setMessage(e.target.value)} placeholder="Initial on-chain message" aria-label="Initial contract message" />
        <button className="cd-sb-deploy-btn" onClick={deploy} disabled={disabled}>{buttonLabel}</button>
        <div className="cd-sb-deploy-meta">Auto-switches your wallet to Arc Mainnet · chain 5042 · wallet pays gas in native USDC</div>
        {status && <div className="cd-sb-deploy-status">{status}</div>}
        {error && !status && <div className="cd-sb-deploy-status bad">{error.message}</div>}
        {hash && <a className="cd-sb-deploy-link" href={txUrl} target="_blank" rel="noreferrer">View deployment transaction ↗</a>}
        {contractAddress && <a className="cd-sb-deploy-link" href={contractUrl} target="_blank" rel="noreferrer">View contract {contractAddress.slice(0, 6)}…{contractAddress.slice(-4)} ↗</a>}
        {address && <div className="cd-sb-deploy-meta">Owner: {address.slice(0, 6)}…{address.slice(-4)}</div>}
      </div>

      <div className="cd-deploy-history">
        <div className="cd-deploy-history-head">
          <span>YOUR DEPLOYMENTS</span>
          {history.length > 0 && <button className="cd-deploy-clear" onClick={clearHistory}>CLEAR</button>}
        </div>
        {history.length === 0 && <div className="cd-deploy-empty">No deployments yet on this device.</div>}
        {history.map((r) => (
          <div key={r.hash} className="cd-deploy-item">
            <div className="cd-deploy-item-msg">{r.message || "(no message)"}</div>
            <div className="cd-deploy-item-row">
              <span className="cd-deploy-item-label">TX</span>
              <a href={`${EXPLORER}/tx/${r.hash}`} target="_blank" rel="noreferrer">{r.hash.slice(0, 10)}…{r.hash.slice(-6)}</a>
            </div>
            {r.contractAddress && (
              <div className="cd-deploy-item-row">
                <span className="cd-deploy-item-label">CONTRACT</span>
                <a href={`${EXPLORER}/address/${r.contractAddress}`} target="_blank" rel="noreferrer">{r.contractAddress.slice(0, 6)}…{r.contractAddress.slice(-4)}</a>
              </div>
            )}
            <div className="cd-deploy-item-time">{new Date(r.timestamp).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="cd-deploy-card" style={{ marginTop: 20, borderColor: "#39e01466" }}>
        <div className="cd-sb-deploy-title">⬢ ONE-TIME: DEPLOY SHARED GUESTBOOK</div>
        <div className="cd-sb-deploy-copy">Temporary admin action — deploys the single shared CronusGuestbook contract that the public note wall will read from. No owner, no privileged deployer. Run this once, then this block gets removed.</div>
        <button className="cd-sb-deploy-btn" onClick={deployGuestbookOnce} disabled={!isConnected || gbPending || gbConfirming}>
          {gbPending ? "CONFIRM IN WALLET" : gbConfirming ? "CONFIRMING…" : gbSuccess ? "DEPLOYED" : "DEPLOY GUESTBOOK"}
        </button>
        {gbStatus && <div className="cd-sb-deploy-status">{gbStatus}</div>}
        {gbError && !gbStatus && <div className="cd-sb-deploy-status bad">{gbError.message}</div>}
        {gbHash && <a className="cd-sb-deploy-link" href={`${EXPLORER}/tx/${gbHash}`} target="_blank" rel="noreferrer">View deployment transaction ↗</a>}
        {gbReceipt?.contractAddress && (
          <div className="cd-sb-deploy-status" style={{ color: "#39e014", fontWeight: 700 }}>
            GUESTBOOK ADDRESS: {gbReceipt.contractAddress}
          </div>
        )}
      </div>
    </section>
  )
}
