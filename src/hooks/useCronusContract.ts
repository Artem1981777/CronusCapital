import { useWalletClient, usePublicClient } from "wagmi"
import { CRONUS_ABI, DEPLOYED_CONTRACT } from "../contracts"

export function useCronusContract() {
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  async function logDecision(
    topic: string,
    decision: string,
    agentId: number,
    confidence: number
  ): Promise<string | null> {
    if (!walletClient || !publicClient) return null
    try {
      const hash = await walletClient.writeContract({
        address: DEPLOYED_CONTRACT as `0x${string}`,
        abi: CRONUS_ABI,
        functionName: "logDecision",
        args: [topic, decision, agentId, BigInt(confidence)]
      })
      await publicClient.waitForTransactionReceipt({ hash })
      return hash
    } catch (e) {
      console.error("Contract error:", e)
      return null
    }
  }

  async function getDecisionsCount(): Promise<number> {
    if (!publicClient) return 0
    try {
      const count = await publicClient.readContract({
        address: DEPLOYED_CONTRACT as `0x${string}`,
        abi: CRONUS_ABI,
        functionName: "getDecisionsCount"
      })
      return Number(count)
    } catch { return 0 }
  }

  return { logDecision, getDecisionsCount }
}
