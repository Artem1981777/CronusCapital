import { useAccount, useConnect, useDisconnect, useBalance } from "wagmi"
import { arcTestnet } from "../wagmiConfig"

export function WalletButton() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({ address })

  if (isConnected && address) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#4caf7e", fontSize: "10px", letterSpacing: "2px" }}>
            {address.slice(0, 6)}...{address.slice(-4)}
          </div>
          {balance && (
            <div style={{ color: "#c9a84c", fontSize: "10px", letterSpacing: "1px" }}>
              {(Number(balance.value) / 1e18).toFixed(4)} {balance.symbol}
            </div>
          )}
        </div>
        <button
          onClick={() => disconnect()}
          style={{
            padding: "6px 14px", background: "transparent",
            border: "1px solid #2a2416", color: "#555",
            fontFamily: "Cinzel, serif", fontSize: "9px",
            letterSpacing: "2px", cursor: "pointer"
          }}
        >DISCONNECT</button>
      </div>
    )
  }

  return (
    <button
      onClick={() => connect({ connector: connectors[0], chainId: arcTestnet.id })}
      style={{
        padding: "8px 16px",
        background: "transparent",
        border: "1px solid #c9a84c",
        color: "#c9a84c",
        fontFamily: "Cinzel, serif",
        fontSize: "10px",
        letterSpacing: "2px",
        cursor: "pointer",
        transition: "all 0.2s"
      }}
    >CONNECT WALLET</button>
  )
}
