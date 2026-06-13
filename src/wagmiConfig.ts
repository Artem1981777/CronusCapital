import { createConfig, http } from "wagmi"
import { defineChain } from "viem"
import { injected, walletConnect } from "wagmi/connectors"

export const arcTestnet = defineChain({
	id: 5042002,
	name: "Arc Testnet",
	nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
	rpcUrls: {
		default: { http: ["https://rpc.testnet.arc.network"] },
	},
	blockExplorers: {
		default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.network" },
	},
	testnet: true,
})

const projectId = "854e57f5212e148744af551c3d2794bc"

export const wagmiConfig = createConfig({
	chains: [arcTestnet],
	connectors: [
		injected({ target: "metaMask" }),
		injected(),
		walletConnect({ projectId }),
	],
	transports: { [arcTestnet.id]: http("/api/rpc") },
})

export { projectId }
