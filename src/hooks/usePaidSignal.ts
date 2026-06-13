import { useWalletClient } from "wagmi"
import { wrapFetchWithPayment } from "x402-fetch"

export function usePaidSignal() {
  const { data: walletClient } = useWalletClient()
  async function buySignal(topic: string) {
    if (!walletClient) throw new Error("Connect wallet first")
    const fetchWithPay = wrapFetchWithPayment(fetch, walletClient as any)
    const res = await fetchWithPay(`/api/signal?topic=${encodeURIComponent(topic)}`)
    return res.json() // { paid, payer, settlement, report }
  }
  return { buySignal }
}
