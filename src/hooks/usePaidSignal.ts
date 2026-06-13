import { useAccount, useWalletClient } from "wagmi"

export function usePaidSignal() {
	const { address } = useAccount()
	const { data: walletClient } = useWalletClient()

	async function buySignal(topic: string) {
		if (!walletClient || !address) throw new Error("Connect wallet first")
		// DEMO MODE (Lepton testnet): the generic x402 lib does not yet support the
		// Arc network enum, so we bypass wrapFetchWithPayment here. We still pop the
		// wallet for a gas-free signature (proof of intent), then send an x-payment
		// header so the server returns the report without any on-chain settlement.
		const message =
			"Cronus Capital - authorize $0.02 USDC pay-per-call on Arc Testnet for topic: " + topic
		const signature = await walletClient.signMessage({ account: address, message })

		// Arc v0.7.2 — attach a TX memo (reference ID) for clean reconciliation / invoicing
		const memo =
			"CRONUS-" + topic.slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "") + "-" + Date.now().toString(36).toUpperCase().slice(-4)

		const payment = btoa(JSON.stringify({ demo: true, payer: address, signature, topic, memo }))

		const res = await fetch("/api/signal?topic=" + encodeURIComponent(topic), {
			headers: { "x-payment": payment },
		})
		return res.json() // { paid, demo, payer, memo, report }
	}

	return { buySignal }
}
