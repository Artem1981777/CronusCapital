// api/manifest.js — machine-readable x402 service manifest so any AI agent can discover & pay Cronus.
const NETWORK    = process.env.X402_NETWORK     || "arc-testnet"
const CHAIN_ID   = Number(process.env.ARC_CHAIN_ID || "5042002")
const USDC_ASSET = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase()
const PAY_TO     = (process.env.CRONUS_PAYTO     || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd").toLowerCase()
const PRICE      = process.env.SIGNAL_PRICE || "20000"

export default function handler(req, res) {
  const host = (req.headers && req.headers.host) || "localhost"
  const origin = "https://" + host
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Cache-Control", "public, max-age=300")
  res.status(200).json({
    name: "Cronus Capital",
    description: "Autonomous market-intelligence agent. Pay per call in USDC on Arc (x402) to receive a verifiable, on-chain-committed +EV market signal.",
    protocol: "x402",
    x402Version: 1,
    discovery: { manifest: origin + "/api/manifest", openapi: origin + "/api/openapi" },
    network: { name: NETWORK, chainId: CHAIN_ID, asset: USDC_ASSET, symbol: "USDC", decimals: 6 },
    services: [{
      resource: origin + "/api/signal",
      method: "GET",
      title: "Verifiable +EV market signal",
      description: "One paid call returns a market verdict with reasoning trace and a keccak256 commitment of the response.",
      price: { amount: PRICE, display: (Number(PRICE) / 1e6) + " USDC", asset: USDC_ASSET, decimals: 6, symbol: "USDC" },
      scheme: "exact",
      payTo: PAY_TO,
      params: { topic: "string (optional), e.g. 'BTC-USDC momentum'" },
      flow: [
        "GET " + origin + "/api/signal?topic=... -> HTTP 402 with accepts[]",
        "pay " + PRICE + " atomic USDC to payTo on " + NETWORK,
        "retry GET with header 'X-PAYMENT: <txHash>'",
        "HTTP 200 -> { paid, payment, commitment, report }"
      ],
      verification: "on-chain via JSON-RPC: USDC transfer >= price to payTo, tx success, within freshness window",
    }],
    agentHint: "To buy: GET the resource, read accepts[0], pay maxAmountRequired USDC to payTo on the given network, then retry the GET with header X-PAYMENT set to your txHash.",
  })
}
