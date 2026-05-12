import { createConfig, http } from "wagmi"
import { defineChain } from "viem"
import { walletConnect, injected, metaMask } from "wagmi/connectors"

export const arcTestnet = defineChain({
  id: 1313161555,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: { http: ["/api/rpc"] }
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.network" }
  },
  testnet: true
})

const projectId = "854e57f5212e148744af551c3d2794bc"

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [
    injected(),
    metaMask(),
    walletConnect({ projectId })
  ],
  transports: { [arcTestnet.id]: http("/api/rpc") }
})

export { projectId }
