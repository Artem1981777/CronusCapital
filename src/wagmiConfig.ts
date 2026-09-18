import { createConfig, http } from "wagmi"
import { defineChain } from "viem"
import { injected, metaMask, walletConnect } from "wagmi/connectors"

export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc Mainnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    public: { http: ["https://rpc.mainnet.arc.io"] },
    default: { http: ["https://rpc.mainnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
  testnet: false,
})

export const baseMainnet = defineChain({
  id: 8453,
  name: "Base Mainnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    public: { http: ["https://mainnet.base.org"] },
    default: { http: ["https://mainnet.base.org"] },
  },
  blockExplorers: {
    default: { name: "Basescan", url: "https://basescan.org" },
  },
  testnet: false,
})

const projectId = "854e57f5212e148744af551c3d2794bc"

export const wagmiConfig = createConfig({
  chains: [arcMainnet, baseMainnet],
  connectors: [
    metaMask(),
    injected(),
    walletConnect({ projectId }),
  ],
  transports: {
    [arcMainnet.id]: http("https://rpc.mainnet.arc.io"),
    [baseMainnet.id]: http("https://mainnet.base.org"),
  },
})

export { projectId }
