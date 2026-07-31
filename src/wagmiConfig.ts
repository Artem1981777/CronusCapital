import { createConfig, http } from "wagmi"
import { defineChain } from "viem"
import { baseSepolia } from "viem/chains"
import { injected, metaMask, walletConnect } from "wagmi/connectors"

export const arcTestnet = defineChain({
	id: 5042002,
	name: "Arc Testnet",
	nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
	rpcUrls: {
                public: { http: ["https://rpc.testnet.arc.network"] },
		default: { http: ["https://rpc.testnet.arc.network"] },
	},
	blockExplorers: {
		default: { name: "Arc Explorer", url: "https://testnet.arcscan.app" },
	},
	testnet: true,
})

const projectId = "854e57f5212e148744af551c3d2794bc"

export const wagmiConfig = createConfig({
	chains: [arcTestnet, baseSepolia],
	connectors: [
		metaMask(),
		injected(),
		walletConnect({ projectId }),
	],
	transports: { [arcTestnet.id]: http("/api/rpc"), [baseSepolia.id]: http("https://sepolia.base.org") },
})

export { projectId }
