import { useCallback, useState } from "react"
import { useAccount, useWalletClient, usePublicClient } from "wagmi"

/* ===== Pay-per-call oracle (x402) — REAL on-chain payment client =====
 - pays 0.02 USDC on Arc, then passes the mined txHash to the server
 - AbortController timeout, retry/backoff on 5xx (never on 4xx/402)
 - typed response + local cost tracking (KPI layer)
*/

export interface OracleOpportunity {
  question: string
  recommendation: string
  expectedValue: number
  size: number
  reasoning: string
}
export interface OracleReport {
  topic: string
  thesis: string
  opportunities: Array<OracleOpportunity>
  riskNote: string
}
export interface SignalResponse {
  paid?: boolean
  demo?: boolean
  payer?: string
  memo?: string
  report?: OracleReport
  error?: string
  message?: string
}

interface SpendState { count: number; usd: number }

const PRICE_USD = 0.02
const PRICE_ATOMIC = 20000n // 0.02 USDC (6 decimals) on Arc
const PAY_TO = "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd" as `0x${string}`
const SPEND_KEY = "cronus.spend.v1"
const TIMEOUT_MS = 30000
const MAX_RETRIES = 2

function readSpend(): SpendState {
  try {
    if (typeof window === "undefined") return { count: 0, usd: 0 }
    const raw = window.localStorage.getItem(SPEND_KEY)
    if (!raw) return { count: 0, usd: 0 }
    const parsed = JSON.parse(raw)
    return { count: Number(parsed.count) || 0, usd: Number(parsed.usd) || 0 }
  } catch {
    return { count: 0, usd: 0 }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown = new Error("Request failed")
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      clearTimeout(timer)
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        lastErr = new Error("Oracle server error " + res.status)
        await delay(400 * Math.pow(2, attempt))
        continue
      }
      return res
    } catch (e) {
      clearTimeout(timer)
      lastErr = e
      if (attempt < MAX_RETRIES) {
        await delay(400 * Math.pow(2, attempt))
        continue
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Request failed")
}

export function usePaidSignal() {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [spend, setSpend] = useState<SpendState>(() => readSpend())

  const recordSpend = useCallback(() => {
    setSpend((prev) => {
      const next: SpendState = { count: prev.count + 1, usd: Math.round((prev.usd + PRICE_USD) * 100) / 100 }
      try {
        window.localStorage.setItem(SPEND_KEY, JSON.stringify(next))
      } catch {
        /* ignore storage errors */
      }
      return next
    })
  }, [])

  const resetSpend = useCallback(() => {
    setSpend({ count: 0, usd: 0 })
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(SPEND_KEY)
    } catch {
      /* ignore storage errors */
    }
  }, [])

  const buySignal = useCallback(
    async (topic: string): Promise<SignalResponse> => {
      if (!walletClient || !address) throw new Error("Connect wallet first")
      if (!publicClient) throw new Error("RPC not ready — switch to Arc Testnet and retry")
      const clean = topic.trim().slice(0, 120)
      if (!clean) throw new Error("Enter a topic to consult the oracle")

      setLoading(true)
      setError("")
      try {
        // REAL x402: pay 0.02 USDC (native on Arc) to payTo, then send the mined
        // txHash as X-PAYMENT. Server verifies it on-chain (0x + 64 hex).
        const hash = await walletClient.sendTransaction({
          account: address,
          to: PAY_TO,
          value: PRICE_ATOMIC,
        })
        // wait until mined, else server returns "tx not found / not mined"
        await publicClient.waitForTransactionReceipt({ hash })

        const res = await fetchWithRetry("/api/signal?topic=" + encodeURIComponent(clean), {
          headers: { "x-payment": hash },
        })

        if (!res.ok) {
          let detail = ""
          try {
            const body = await res.json()
            if (body && (body.error || body.message)) detail = String(body.error || body.message)
          } catch {
            /* non-JSON error body */
          }
          const label = res.status === 402 ? "Payment required" : "Oracle request failed"
          throw new Error(label + " (" + res.status + ")" + (detail ? ": " + detail : ""))
        }

        const data = (await res.json()) as SignalResponse
        if (data && data.paid) recordSpend()
        return data
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg.slice(0, 160))
        throw e
      } finally {
        setLoading(false)
      }
    },
    [walletClient, address, publicClient, recordSpend],
  )

  return { buySignal, loading, error, totalSpent: spend.usd, callCount: spend.count, resetSpend }
}
