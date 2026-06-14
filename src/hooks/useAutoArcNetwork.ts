import { useEffect } from "react"
import { useAccount, useChainId, useSwitchChain } from "wagmi"
import { arcTestnet } from "../wagmiConfig"

export function useAutoArcNetwork() {
	const { isConnected } = useAccount()
	const chainId = useChainId()
	const { switchChain } = useSwitchChain()
	useEffect(() => {
		if (isConnected && chainId !== arcTestnet.id) {
			switchChain?.({ chainId: arcTestnet.id })
		}
	}, [isConnected, chainId, switchChain])
}
