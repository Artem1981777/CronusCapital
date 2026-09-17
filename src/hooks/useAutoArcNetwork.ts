import { useEffect } from "react"
import { useAccount, useChainId, useSwitchChain } from "wagmi"
import { arcMainnet } from "../wagmiConfig"

export function useAutoArcNetwork() {
	const { isConnected } = useAccount()
	const chainId = useChainId()
	const { switchChain } = useSwitchChain()
	useEffect(() => {
		if (isConnected && chainId !== arcMainnet.id) {
			switchChain?.({ chainId: arcMainnet.id })
		}
	}, [isConnected, chainId, switchChain])
}
