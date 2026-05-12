import { useState } from "react"
import { useAccount, useConnect, useDisconnect, useBalance } from "wagmi"
import { arcTestnet } from "../wagmiConfig"

export function WalletButton() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({ address })
  const [showMenu, setShowMenu] = useState(false)

  if (isConnected && address) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#4caf7e", fontSize: "10px", letterSpacing: "2px" }}>
            {address.slice(0, 6)}...{address.slice(-4)}
          </div>
          {balance && (
            <div style={{ color: "#c9a84c", fontSize: "10px" }}>
              {(Number(balance.value) / 1e18).toFixed(4)} {balance.symbol}
            </div>
          )}
        </div>
        <button onClick={() => disconnect()} style={{
          padding: "6px 14px", background: "transparent",
          border: "1px solid #2a2416", color: "#555",
          fontFamily: "Cinzel, serif", fontSize: "9px",
          letterSpacing: "2px", cursor: "pointer"
        }}>DISCONNECT</button>
      </div>
    )
  }

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setShowMenu(m => !m)} style={{
        padding: "8px 16px", background: "transparent",
        border: "1px solid #c9a84c", color: "#c9a84c",
        fontFamily: "Cinzel, serif", fontSize: "10px",
        letterSpacing: "2px", cursor: "pointer"
      }}>CONNECT WALLET</button>

      {showMenu && (
        <div style={{
          position: "absolute", right: 0, top: "110%",
          background: "#0a0806", border: "1px solid #2a2416",
          minWidth: "200px", zIndex: 100
        }}>
          {connectors.map(connector => (
            <button key={connector.id} onClick={() => {
              connect({ connector, chainId: arcTestnet.id })
              setShowMenu(false)
            }} style={{
              display: "block", width: "100%", padding: "12px 16px",
              background: "transparent", border: "none",
              borderBottom: "1px solid #1a1710", color: "#d4c5a0",
              fontFamily: "Courier New, monospace", fontSize: "11px",
              letterSpacing: "1px", cursor: "pointer", textAlign: "left"
            }}>
              {connector.name === "WalletConnect" ? "📱 " : "🦊 "}{connector.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
