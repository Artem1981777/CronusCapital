import { useMemo, useState } from "react"
import { useAccount, useChainId, useDeployContract, useSwitchChain, useWaitForTransactionReceipt } from "wagmi"
import { cronusProofNoteAbi, cronusProofNoteBytecode } from "../contracts/cronusProofNoteArtifact"

const ARC_CHAIN_ID = 5042
const EXPLORER = "https://explorer.arc.io"

export default function ContractDeployPanel() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const { deployContractAsync, data: hash, isPending, error, reset } = useDeployContract()
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const [message, setMessage] = useState("Cronus proof note")
  const [status, setStatus] = useState("")
  const onArc = chainId === ARC_CHAIN_ID
  const contractAddress = receipt?.contractAddress
  const txUrl = hash ? `${EXPLORER}/tx/${hash}` : ""
  const contractUrl = contractAddress ? `${EXPLORER}/address/${contractAddress}` : ""
  const disabled = !isConnected || isPending || isConfirming || !message.trim() || message.length > 140
  const buttonLabel = useMemo(() => {
    if (!isConnected) return "CONNECT WALLET FIRST"
    if (!onArc) return "SWITCH TO ARC"
    if (isPending) return "CONFIRM IN WALLET"
    if (isConfirming) return "CONFIRMING…"
    if (isSuccess) return "DEPLOY ANOTHER NOTE"
    return "DEPLOY CONTRACT"
  }, [isConnected, onArc, isPending, isConfirming, isSuccess])

  async function deploy() {
    reset()
    setStatus("")
    if (!isConnected) { setStatus("Connect a wallet first."); return }
    if (!onArc) {
      try { await switchChainAsync({ chainId: ARC_CHAIN_ID }); setStatus("Arc selected. Press deploy again to review the transaction.") }
      catch { setStatus("Network switch was rejected in your wallet.") }
      return
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

  return (
    <section className="cd-sb-deploy" aria-label="Deploy a Cronus contract">
      <div className="cd-sb-deploy-title">⬡ DEPLOY CONTRACT</div>
      <div className="cd-sb-deploy-copy">Deploy a real Cronus Proof Note from any connected wallet. Your wallet becomes the owner.</div>
      <input className="cd-sb-deploy-input" value={message} maxLength={140} onChange={(e) => setMessage(e.target.value)} placeholder="Initial on-chain message" aria-label="Initial contract message" />
      <button className="cd-sb-deploy-btn" onClick={deploy} disabled={disabled}>{buttonLabel}</button>
      <div className="cd-sb-deploy-meta">Arc Mainnet · 5042 · wallet pays gas in native USDC</div>
      {status && <div className="cd-sb-deploy-status">{status}</div>}
      {error && !status && <div className="cd-sb-deploy-status bad">{error.message}</div>}
      {hash && <a className="cd-sb-deploy-link" href={txUrl} target="_blank" rel="noreferrer">View deployment transaction ↗</a>}
      {contractAddress && <a className="cd-sb-deploy-link" href={contractUrl} target="_blank" rel="noreferrer">View contract {contractAddress.slice(0, 6)}…{contractAddress.slice(-4)} ↗</a>}
      {!isConnected && <div className="cd-sb-deploy-meta">No server key. Every deployment is signed by the connected wallet.</div>}
      {address && <div className="cd-sb-deploy-meta">Owner: {address.slice(0, 6)}…{address.slice(-4)}</div>}
    </section>
  )
}
