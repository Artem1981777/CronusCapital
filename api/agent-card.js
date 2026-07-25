// api/agent-card.js - machine-readable x402 storefront (ADDITIVE; nothing else touched).
// A stranger agent discovers prices, rules, on-chain identity and proofs here, then buys
// from /api/nano-signal with plain x402. The card is EIP-191 signed by the same treasury
// key that signs delivery receipts, so even the storefront itself is attestable.

const PAY_TO = process.env.CRONUS_PAYTO || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd"
const IDENTITY_REGISTRY = process.env.IDENTITY_REGISTRY || "0x252cAA46b9b0648908000f6C87e0a561DB4dEb6c"
const REPUTATION_REGISTRY = process.env.REPUTATION_REGISTRY || "0x2A19ad056EaE83364B0a6420685974cA219c209E"
const SELLER_AGENT_ID = Number(process.env.SELLER_AGENT_ID || "1")
const NETWORK = process.env.GATEWAY_NETWORK || "eip155:5042002"
const NETWORK_LABEL = process.env.X402_NETWORK || "arc-testnet"
const NANO_PRICE = process.env.NANO_PRICE_USD || "$0.001"
const LOYAL_PRICE = process.env.NANO_LOYAL_PRICE_USD || "$0.0007"
const LOYAL_LOW = process.env.NANO_LOYAL_LOW_USD || "$0.0005"
const LOYAL_HIGH = process.env.NANO_LOYAL_HIGH_USD || "$0.0009"
const DATASET_PRICE = process.env.DATASET_PRICE_USD || "$0.05"
const RAW = "https:" + "//raw.githubusercontent.com/Artem1981777/CronusCapital/main/"
const REPO = "https:" + "//github.com/Artem1981777/CronusCapital"

async function fetchJson(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return await r.json() } catch (_) { return null }
}

let _cache = { t: 0, v: null }

export default async function handler(req, res) {
  res.setHeader("cache-control", "public, max-age=60")
  if (_cache.v && Date.now() - _cache.t < 300000) return res.status(200).json(_cache.v)
  const host = (req.headers && req.headers.host) || "cronus-capital.vercel.app"
  const base = "https:" + "//" + host
  const [policy, tr] = await Promise.all([
    fetchJson(RAW + "m2m-ledger/policy.json"),
    fetchJson(RAW + "m2m-ledger/track-record.json"),
  ])
  const card = {
    standard: "cronus-agent-card-v1",
    kind: "x402 storefront manifest for autonomous agents",
    name: "Cronus Capital - micro trading signals",
    seller: PAY_TO,
    network: NETWORK,
    networkLabel: NETWORK_LABEL,
    identity: { standard: "ERC-8004", registry: IDENTITY_REGISTRY, reputationRegistry: REPUTATION_REGISTRY, agentId: SELLER_AGENT_ID },
    endpoints: {
      quote: base + "/api/nano-signal?quote=1&payer=YOUR_ADDRESS",
      buy: base + "/api/nano-signal?topic=TOPIC&payer=YOUR_ADDRESS",
      counterOffer: base + "/api/nano-signal?quote=1&counter=PRICE&payer=YOUR_ADDRESS",
      credit: base + "/api/nano-signal?credit=1&payer=YOUR_ADDRESS",
      repay: base + "/api/nano-signal?repay=1&payer=YOUR_ADDRESS",
      makeGood: base + "/api/nano-signal?makegood=MISS_KEY&payer=YOUR_ADDRESS",
      dataset: base + "/api/nano-signal?tier=dataset",
    },
    pricing: {
      nano: NANO_PRICE,
      loyalBands: { discount: LOYAL_LOW, standard: LOYAL_PRICE, premium: LOYAL_HIGH },
      dataset: DATASET_PRICE,
      model: "conviction-pegged: the loyal price floats with live oracle confidence, hard-clamped to the band range",
    },
    rules: {
      loyalty: "10+ purchases with a registered ERC-8004 identity unlock the loyal tier",
      haggling: "loyal buyers can counter exactly one band down; deterministic, no LLM in the loop",
      credit: "loyal buyers can hold up to 3 units on credit and repay at the loyal price on a later run",
      stake: "every market-graded MISS entitles the buyer to one free make-good unit",
      calibration: "the premium band is only charged while the seller's average Brier stays within 0.35 over graded signals",
    },
    proofs: {
      trackRecord: RAW + "m2m-ledger/track-record.json",
      trackRecordStats: tr && tr.stats ? tr.stats : null,
      ledger: REPO + "/tree/main/m2m-ledger",
      hashChain: "clone the repo and run: node scripts/verify-chain.mjs (zero keys required)",
      deliveryReceipts: "every paid delivery returns an EIP-191 receipt pinning the report hash before the outcome is known",
      referenceBuyerMandate: policy ? { file: RAW + "m2m-ledger/policy.json", policyHash: policy.policyHash || null } : null,
    },
    honestLabel: "our reference buyer (Rhea) is a second wallet of this project - a disclosed self-demo; this card exists so stranger agents can trade with Cronus too",
    ts: Date.now(),
  }
  let attestation = null
  try {
    const key = process.env.TREASURY_PRIVATE_KEY
    if (key) {
      const { keccak256, stringToHex } = await import("viem")
      const { privateKeyToAccount } = await import("viem/accounts")
      const account = privateKeyToAccount(key.startsWith("0x") ? key : "0x" + key)
      const cardHash = keccak256(stringToHex(JSON.stringify(card)))
      attestation = { standard: "EIP-191", signer: account.address, cardHash: cardHash, signature: await account.signMessage({ message: cardHash }), verify: "recover the signer from the signature over cardHash; cardHash = keccak256(utf8 of JSON.stringify(card))" }
    }
  } catch (_) { attestation = null } // fail open: an unsigned card is still a useful card
  const out = { card: card, attestation: attestation }
  _cache = { t: Date.now(), v: out }
  return res.status(200).json(out)
}
