// api/manifest.js — machine-readable x402 service manifest so any AI agent can discover & pay Cronus.
const NETWORK    = process.env.X402_NETWORK     || "arc-testnet"
const CHAIN_ID   = Number(process.env.ARC_CHAIN_ID || "5042002")
const USDC_ASSET = (process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase()
const PAY_TO     = (process.env.CRONUS_PAYTO     || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd").toLowerCase()
const PRICE      = process.env.SIGNAL_PRICE || "20000"
const NANO_PRICE = process.env.NANO_PRICE_ATOMIC || "1000"
const GATEWAY_NETWORK = process.env.GATEWAY_NETWORK || "eip155:5042002"
const IDENTITY_REGISTRY = (process.env.IDENTITY_REGISTRY || "0x252cAA46b9b0648908000f6C87e0a561DB4dEb6c").toLowerCase()
const JOB_ESCROW = (process.env.JOB_ESCROW || "0x64e55De4CbC3CDf981B2c970807129FA61806873").toLowerCase()
const REPUTATION_REGISTRY = (process.env.REPUTATION_REGISTRY || "0x2A19ad056EaE83364B0a6420685974cA219c209E").toLowerCase()

import { acceptedAssets } from "./fx.js"

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
    paymentRails: ["x402-exact", "circle-gateway-batched"],
    capabilities: {
      identity: { standard: "ERC-8004", registry: origin + "/api/manifest", status: "live", note: "On-chain agent identity + reputation; sellers can gate by resolveByAddress()." },
      settlement: { protocol: "x402", rails: ["x402-exact", "circle-gateway-batched"], asset: "USDC", status: "live", note: "Pay-per-call and gas-free batched nanopayments; USDC is both payment and gas on Arc." },
      workflow: {
        escrow: { endpoint: origin + "/api/fund-escrow", status: "live", note: "ERC-8183 job escrow + funded settlement wallet for on-chain payouts." },
        spendingLimits: { endpoint: origin + "/api/spend-limit", status: "live", note: "Hard daily + per-recipient caps enforced before any USDC leaves the wallet." },
        splitPayments: { endpoint: origin + "/api/split-pay", status: "live", note: "Basis-point fan-out of one payment across multiple counterparties." },
        subscriptions: { endpoint: origin + "/api/subscription", status: "live", note: "Plan-based recurring access with per-call metering." }
      },
      treasury: { endpoint: origin + "/api/treasury-yield", status: "live", note: "Benchmark yield computed from USYC NAV growth recorded on-chain by the Arc oracle, cross-checked against the ERC-4626 teller. No position is claimed without entitlement proven by canCall(), and idle-capital yield stays counterfactual." },
      makeGood: { endpoint: origin + "/api/make-good", status: "live", note: "A wrong stake's principal goes to the counterparty who paid for the signal, not back to us. If the stake ledger cannot be read the route refuses; it never reports zero positions in place of an unread ledger." },
      privacy: { endpoint: origin + "/api/disclosure", status: "live", note: "Selective disclosure of a receipt under a Merkle root: agreed fields revealed, the rest answered as a predicate, tampered leaves rejected." },
      refusals: { endpoint: origin + "/api/capabilities", status: "live", note: "Every route's kinds and the reasons it can refuse. Missing data produces a refusal, never a default value." },
      skinInTheGame: { endpoint: origin + "/api/track-record", status: "live", note: "Agent stakes its own USDC on its predictions and settles on-chain (correct -> return, wrong -> burn); reputation is earned, not claimed." }
    },
    discovery: { manifest: origin + "/api/manifest", openapi: origin + "/api/openapi", capabilities: origin + "/api/capabilities", treasuryYield: origin + "/api/treasury-yield", makeGood: origin + "/api/make-good", disclosure: origin + "/api/disclosure", council: origin + "/api/council", payToThink: origin + "/api/pay-to-think", vaultNav: origin + "/api/vault-nav", receipts: origin + "/api/receipts", metrics: origin + "/api/metrics", traction: origin + "/api/traction", leaderboard: origin + "/api/leaderboard", settlements: origin + "/api/settlements", spendIntent: origin + "/api/spend-intent", scorecard: origin + "/api/scorecard", trackRecord: origin + "/api/track-record", openStake: origin + "/api/open-stake", resolveStake: origin + "/api/resolve-stake", fundEscrow: origin + "/api/fund-escrow", spendLimit: origin + "/api/spend-limit", splitPay: origin + "/api/split-pay", subscription: origin + "/api/subscription", insuranceQuote: origin + "/api/insurance-quote", insuranceBuy: origin + "/api/insurance-buy", insuranceStatus: origin + "/api/insurance-status", cctpStatus: origin + "/api/cctp-status", identityResolver: origin + "/api/identity" },
    network: { name: NETWORK, chainId: CHAIN_ID, asset: USDC_ASSET, symbol: "USDC", decimals: 6 },
    acceptedAssets: acceptedAssets(),
    identityRegistry: { standard: "ERC-8004", address: IDENTITY_REGISTRY, agentId: 1, agentAddress: "0x46213abeca58cc9a89a269fd25a8737c700ca164", network: NETWORK, explorer: "https://testnet.arcscan.app/address/" + IDENTITY_REGISTRY, note: "x402 sellers can resolveByAddress() this agent before serving (reputation gate)" },
    jobEscrow: { standard: "ERC-8183", address: JOB_ESCROW, network: NETWORK, explorer: "https://testnet.arcscan.app/address/" + JOB_ESCROW, gatedBy: "ERC-8004", note: "createJob escrows USDC -> provider submits -> release (client/evaluator) or auto-refund after deadline; providers must hold an ERC-8004 identity" },
    reputationRegistry: { standard: "ERC-8004-reputation", address: REPUTATION_REGISTRY, sellerAgentId: 1, network: NETWORK, explorer: "https://testnet.arcscan.app/address/" + REPUTATION_REGISTRY, note: "clients call giveFeedback(agentId, score, jobRef, uri) after a completed job; identity-gated and de-duplicated per jobRef; getReputation(agentId) returns count and average score" },
    services: [{
      resource: origin + "/api/signal",
      method: "GET",
      title: "Verifiable +EV market signal",
      description: "One paid call returns a market verdict with reasoning trace and a keccak256 commitment of the response.",
      price: { amount: PRICE, display: (Number(PRICE) / 1e6) + " USDC", asset: USDC_ASSET, decimals: 6, symbol: "USDC" },
      scheme: "exact",
      tier: "STANDARD",
      payTo: PAY_TO,
      params: { topic: "string (optional), e.g. 'BTC-USDC momentum'" },
      flow: [
        "GET " + origin + "/api/signal?topic=... -> HTTP 402 with accepts[]",
        "pay " + PRICE + " atomic USDC to payTo on " + NETWORK,
        "retry GET with header 'X-PAYMENT: <txHash>'",
        "HTTP 200 -> { paid, payment, commitment, report }"
      ],
      verification: "on-chain via JSON-RPC: USDC transfer >= price to payTo, tx success, within freshness window",
    }, {
      resource: origin + "/api/nano-signal",
      method: "GET",
      title: "NANO micro-signal (Circle Gateway: batched, gas-free)",
      description: "Sub-cent paid call via Circle Gateway nanopayments. Gas-free, batched settlement. Ideal for agent-to-agent micro-consumption.",
      price: { amount: NANO_PRICE, display: (Number(NANO_PRICE) / 1e6) + " USDC", asset: USDC_ASSET, decimals: 6, symbol: "USDC" },
      scheme: "exact",
      tier: "NANO",
      settlement: "circle-gateway-batched",
      network: GATEWAY_NETWORK,
      payTo: PAY_TO,
      params: { topic: "string (optional), e.g. 'BTC-USDC momentum'" },
      flow: [
        "GET " + origin + "/api/nano-signal -> HTTP 402 with PAYMENT-REQUIRED header (Gateway batching option)",
        "sign EIP-3009 TransferWithAuthorization (gas-free) against the GatewayWallet",
        "retry GET with header 'Payment-Signature: <base64>'",
        "HTTP 200 -> { paid, tier, payment:{ settlement, explorer }, report }"
      ],
      verification: "Circle Gateway facilitator verify+settle; settlement tx verifiable on arcscan",
      requires: "buyer holds a Circle Gateway USDC balance (one-time deposit into the Gateway Wallet)",
    }, {
        resource: origin + "/api/insurance-buy",
        method: "POST",
        title: "Signal insurance (money-back if Cronus is wrong)",
        description: "Insure a position against a wrong Cronus call. Premium = 5% of notional in USDC; full-premium money-back refund if a Cronus decision on the topic shows conviction < 50 within a 24h coverage window (verifiable on-chain via /api/decisions). MCP tools quote/buy/status; the tool layer never moves funds.",
        price: { amount: "5% of notional", display: "5% of insured notional in USDC", asset: USDC_ASSET, decimals: 6, symbol: "USDC" },
        scheme: "exact",
        tier: "INSURANCE",
        payTo: PAY_TO,
        params: { instId: "string (optional), e.g. ETH-USDC", notional: "number (required), position size in USDC to insure", topic: "string (optional), e.g. 'ETH-USDC momentum'", policy_id: "string (status only), returned by buy" },
        endpoints: { quote: origin + "/api/insurance-quote", buy: origin + "/api/insurance-buy", status: origin + "/api/insurance-status" },
        flow: [
          "GET " + origin + "/api/insurance-quote?notional=... -> premium, payout, coverage window, current conviction",
          "GET/POST " + origin + "/api/insurance-buy?notional=... -> HTTP 402 with accepts[] (premium quote)",
          "pay premium atomic USDC to payTo on " + NETWORK + ", then retry with header 'X-PAYMENT: <txHash>'",
          "HTTP 200 -> { policy_id, coverage_window, payout_on_miss }",
          "GET " + origin + "/api/insurance-status?policy_id=... -> { status, refund } (money-back if MISS)"
        ],
        verification: "premium verified on-chain via JSON-RPC (USDC transfer >= premium to payTo); MISS determined from the on-chain CronusDecisions log (/api/decisions). Testnet demo; refunds honored from the self-operated treasury.",
      }],
    agentHint: "To buy (STANDARD): GET the resource, read accepts[0], pay maxAmountRequired USDC to payTo on the given network, then retry the GET with header X-PAYMENT set to your txHash.",
    nanoHint: "To buy (NANO, gas-free): use a Circle Gateway client (@circle-fin/x402-batching) with a funded Gateway balance and call pay(resourceUrl); it signs EIP-3009 offchain and Circle batches settlement.",
		externalPayerHint: "Any third-party wallet/agent can become a counted external payer: GET " + origin + "/api/signal, pay " + PRICE + " atomic USDC to payTo, then retry with X-PAYMENT: <txHash>. One-command CLI: CRONUS_URL=" + origin + " EXTERNAL_PRIVATE_KEY=0x... node scripts/pay-cronus.mjs (use a wallet YOU funded, not a Cronus wallet). Your payment appears at " + origin + "/api/receipts; once verified as independently funded it is added to VERIFIED_EXTERNAL_PAYERS and counted at " + origin + "/api/traction (external_payers). Self-generated test traffic is never counted as external demand.",
  })
}
