// api/openapi.js — OpenAPI 3.0 spec (a.k.a. swagger.json) for the Cronus x402 paywall.
const NETWORK = process.env.X402_NETWORK || "arc-testnet"
const PRICE   = process.env.SIGNAL_PRICE || "20000"

export default function handler(req, res) {
  const host = (req.headers && req.headers.host) || "localhost"
  const origin = "https://" + host
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Cache-Control", "public, max-age=300")
  res.status(200).json({
    openapi: "3.0.3",
    info: {
      title: "Cronus Capital x402 API",
      version: "1.0.0",
      description: "Pay-per-call market intelligence over the x402 protocol (USDC on Arc). Point your AI agent at this spec to discover and pay for a verifiable +EV signal.",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/signal": {
        get: {
          summary: "Buy a verifiable +EV market signal",
          description: "First request without payment returns HTTP 402 with x402 payment requirements. Pay " + PRICE + " atomic USDC on " + NETWORK + " to payTo, then retry with the X-PAYMENT header set to your txHash.",
          parameters: [
            { name: "topic", in: "query", required: false, schema: { type: "string" }, example: "BTC-USDC momentum" },
            { name: "X-PAYMENT", in: "header", required: false, schema: { type: "string" }, description: "Arc txHash (0x + 64 hex) of the USDC payment to payTo" },
          ],
          responses: {
            "402": {
              description: "Payment required (x402).",
              content: { "application/json": { schema: { type: "object", properties: {
                x402Version: { type: "integer" },
                accepts: { type: "array", items: { type: "object", properties: {
                  scheme: { type: "string" }, network: { type: "string" }, maxAmountRequired: { type: "string" },
                  resource: { type: "string" }, payTo: { type: "string" }, asset: { type: "string" },
                } } },
                error: { type: "string" },
              } } } },
            },
            "200": {
              description: "Payment verified on-chain - signal returned.",
              content: { "application/json": { schema: { type: "object", properties: {
                paid: { type: "boolean" },
                payment: { type: "object", properties: { network: { type: "string" }, txHash: { type: "string" }, payer: { type: "string" }, amount: { type: "string" }, explorer: { type: "string" } } },
                commitment: { type: "string", description: "keccak256 commitment of the report" },
                report: { type: "object" },
              } } } },
            },
          },
        },
      },
    },
  })
}
