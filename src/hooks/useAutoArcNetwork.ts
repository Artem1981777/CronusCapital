import { useEffect } from "react"
import { useAccount, useChainId, useSwitchChain } from "wagmi"
import { arcMainnet, baseMainnet } from "../wagmiConfig"

export function useAutoArcNetwork() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  useEffect(() => {
    const supported = chainId === arcMainnet.id || chainId === baseMainnet.id
    if (isConnected && !supported) {
      switchChain?.({ chainId: arcMainnet.id })
    }
  }, [isConnected, chainId, switchChain])
}
