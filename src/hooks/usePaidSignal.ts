import { useCallback, useState } from "react"
import { useAccount, useWalletClient } from "wagmi"

/* ===== Pay-per-call oracle (x402 demo) — production-hardened client =====
   - AbortController timeout so the UI never hangs
   - retry with exponential backoff on network / 5xx (never on 4xx / 402)
   - typed response + descriptive errors (server detail surfaced)
   - local cost tracking ($0.02 per paid call) for the KPI / monetization layer
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
			const clean = topic.trim().slice(0, 120)
			if (!clean) throw new Error("Enter a topic to consult the oracle")

			setLoading(true)
			setError("")
			try {
				// DEMO MODE (Lepton testnet): the generic x402 lib does not yet support the
				// Arc network enum, so we bypass wrapFetchWithPayment here. We still pop the
				// wallet for a gas-free signature (proof of intent), then send an x-payment
				// header so the server returns the report without any on-chain settlement.
				const message =
					"Cronus Capital - authorize $0.02 USDC pay-per-call on Arc Testnet for topic: " + clean
				const signature = await walletClient.signMessage({ account: address, message })

				// Arc v0.7.2 — attach a TX memo (reference ID) for clean reconciliation / invoicing
				const memo =
					"CRONUS-" + clean.slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "") + "-" + Date.now().toString(36).toUpperCase().slice(-4)

				const payment = btoa(JSON.stringify({ demo: true, payer: address, signature, topic: clean, memo }))

				const res = await fetchWithRetry("/api/signal?topic=" + encodeURIComponent(clean), {
					headers: { "x-payment": payment },
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

				const data = (await res.json()) as SignalResponse // { paid, demo, payer, memo, report }
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
		[walletClient, address, recordSpend],
	)

	return { buySignal, loading, error, totalSpent: spend.usd, callCount: spend.count, resetSpend }
}
