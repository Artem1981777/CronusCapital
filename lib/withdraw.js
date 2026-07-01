// lib/withdraw.js — PURE helpers for cross-chain USDC withdraw Arc -> any EVM
// via Circle CCTP depositForBurn. NO keys, NO network, NO funds moved here.
// Domain values verified against @circle-fin/x402-batching GATEWAY_DOMAINS
// (== canonical CCTP domains). The live burn endpoint (treasury-signed) is
// separate and gated; this module only validates and builds call args.

const ARC_USDC = "0x3600000000000000000000000000000000000000"

// Canonical CCTP testnet domains (name -> domain id).
export const CCTP_DOMAINS = {
  sepolia: 0,
  avalancheFuji: 1,
  optimismSepolia: 2,
  arbitrumSepolia: 3,
  baseSepolia: 6,
  polygonAmoy: 7,
  unichainSepolia: 10,
}

// Destination USDC (for display/verification only; mint lands here after attestation).
export const DEST_USDC = {
  sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  avalancheFuji: "0x5425890298aed601595a70AB815c96711a31Bc65",
  optimismSepolia: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
  arbitrumSepolia: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  baseSepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  polygonAmoy: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  unichainSepolia: "0x31d0220469e10c4E71834a79b1f276d740d3768F",
}

// CCTP v2 depositForBurn (no hook) ABI fragment.
export const CCTP_DEPOSIT_FOR_BURN_ABI = [
  { type: "function", name: "depositForBurn", stateMutability: "nonpayable", inputs: [
    { name: "amount", type: "uint256" },
    { name: "destinationDomain", type: "uint32" },
    { name: "mintRecipient", type: "bytes32" },
    { name: "burnToken", type: "address" },
    { name: "destinationCaller", type: "bytes32" },
    { name: "maxFee", type: "uint256" },
    { name: "minFinalityThreshold", type: "uint32" },
  ], outputs: [] },
]

export function isHexAddress(a) {
  return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a)
}

export function evmAddressToBytes32(a) {
  if (!isHexAddress(a)) throw new Error("invalid EVM address: " + String(a))
  return "0x000000000000000000000000" + a.toLowerCase().replace(/^0x/, "")
}

export function supportedChains() {
  return Object.keys(CCTP_DOMAINS)
}

export function resolveDomain(chain) {
  if (typeof chain === "number" && Number.isInteger(chain)) {
    const known = Object.values(CCTP_DOMAINS)
    if (known.includes(chain)) return chain
    throw new Error("unknown CCTP domain: " + chain)
  }
  const d = CCTP_DOMAINS[chain]
  if (d === undefined) throw new Error("unsupported destination chain: " + String(chain))
  return d
}

// Build depositForBurn call args. Pure: throws on any invalid input, moves nothing.
export function buildBurnArgs(opts) {
  const o = opts || {}
  const amount = BigInt(o.amountAtomic)
  if (amount <= 0n) throw new Error("amount must be > 0")
  const domain = resolveDomain(o.destChain)
  const mintRecipient = evmAddressToBytes32(o.recipient)
  const maxFee = (o.maxFeeAtomic === undefined || o.maxFeeAtomic === null) ? amount / 100n : BigInt(o.maxFeeAtomic)
  if (maxFee >= amount) throw new Error("maxFee must be < amount")
  const ZERO32 = "0x" + "0".repeat(64)
  return {
    functionName: "depositForBurn",
    args: [amount, domain, mintRecipient, ARC_USDC, ZERO32, maxFee, 2000],
    domain,
    mintRecipient,
    burnToken: ARC_USDC,
    destinationCaller: ZERO32,
    maxFee,
    minFinalityThreshold: 2000,
  }
}
