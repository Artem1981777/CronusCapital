import { createConfig, http } from "wagmi"
import { defineChain } from "viem"
import { metaMask, injected } from "wagmi/connectors"

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

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected(), metaMask()],
  transports: { [arcTestnet.id]: http() }
})
