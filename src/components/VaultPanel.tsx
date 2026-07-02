// src/components/VaultPanel.tsx — read-only on-chain view of the Arc testnet vault (real reads; additive, fail-open).
import { useEffect, useState, useCallback } from "react"
import { useAccount, usePublicClient } from "wagmi"

const ARC_CHAIN_ID = 5042002
const VAULT_ADDRESS = "0x13B6984357e27dAB17DF44a6396042239e70542C" as const
const VAULT_ABI = [
  { type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "shares", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "convertToAssets", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const

export function VaultPanel() {
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const { address, isConnected } = useAccount()
  const [tvl, setTvl] = useState<string | null>(null)
  const [pos, setPos] = useState<string | null>(null)
  const [err, setErr] = useState(false)

  const load = useCallback(async () => {
    if (!publicClient) return
    try {
      const t = await publicClient.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "totalAssets" }) as bigint
      setTvl((Number(t) / 1e6).toFixed(2)); setErr(false)
      if (isConnected && address) {
        const sh = await publicClient.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "shares", args: [address] }) as bigint
        const v = await publicClient.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "convertToAssets", args: [sh] }) as bigint
        setPos((Number(v) / 1e6).toFixed(4))
      } else { setPos(null) }
    } catch { setErr(true) }
  }, [publicClient, address, isConnected])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async on-chain read; state is set only after await
    load()
    const id = window.setInterval(() => { load() }, 15000)
    return () => window.clearInterval(id)
  }, [load])

  return (
    <div className="cd-vault">
      <div className="cd-vault-head">
        <span className="cd-vault-title">◈ VAULT</span>
        <a className="cd-vault-src" href={"https://testnet.arcscan.app/address/" + VAULT_ADDRESS} target="_blank" rel="noreferrer">Arc testnet · on-chain read</a>
      </div>
      <div className="cd-vault-grid">
        <div className="cd-vault-cell">
          <div className="cd-vault-num">{err ? "n/a" : tvl == null ? "…" : "$" + tvl}</div>
          <div className="cd-vault-label">TOTAL VALUE LOCKED</div>
          <div className="cd-vault-cap">totalAssets() · USDC</div>
        </div>
        <div className="cd-vault-cell">
          <div className="cd-vault-num">{!isConnected ? "—" : err ? "n/a" : pos == null ? "…" : "$" + pos}</div>
          <div className="cd-vault-label">YOUR POSITION</div>
          <div className="cd-vault-cap">{isConnected ? "shares -> convertToAssets()" : "connect wallet to view"}</div>
        </div>
      </div>
      <div className="cd-vault-note">Read-only view. Deposits / withdrawals live in the Overview dashboard. Figures are live on-chain reads from the Arc testnet vault (testnet balances).</div>
    </div>
  )
}
