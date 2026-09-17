import { createConfig, http } from "wagmi"
import { defineChain } from "viem"
import { injected, metaMask, walletConnect } from "wagmi/connectors"

export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    public: { http: ["https://rpc.mainnet.arc.io"] },
    default: { http: ["https://rpc.mainnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
  testnet: false,
})

const projectId = "854e57f5212e148744af551c3d2794bc"

export const wagmiConfig = createConfig({
  chains: [arcMainnet],
  connectors: [
    metaMask(),
    injected(),
    walletConnect({ projectId }),
  ],
  transports: { [arcMainnet.id]: http("/api/rpc") },
})

export { projectId }
