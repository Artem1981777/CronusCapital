// lib/withdraw.js — PURE helpers for cross-chain USDC withdraw Arc -> Base
// via Circle CCTP depositForBurn. NO keys, NO network, NO funds moved here.
// Domain values are Circle's canonical CCTP domains — identical on testnet
// and mainnet for a given chain. The live burn endpoint (treasury-signed) is
// separate and gated; this module only validates and builds call args.

const ARC_USDC = "0x3600000000000000000000000000000000000000"

// Canonical CCTP domains (name -> domain id). Mainnet scope: Arc + Base only.
export const CCTP_DOMAINS = {
  arc: 26,
  base: 6,
}

// Destination USDC (for display/verification only; mint lands here after attestation).
export const DEST_USDC = {
  arc: "0x3600000000000000000000000000000000000000",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
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
  const burnToken = o.burnToken || ARC_USDC
  const ZERO32 = "0x" + "0".repeat(64)
  return {
    functionName: "depositForBurn",
    args: [amount, domain, mintRecipient, burnToken, ZERO32, maxFee, 1000],
    domain,
    mintRecipient,
    burnToken: burnToken,
    destinationCaller: ZERO32,
    maxFee,
    minFinalityThreshold: 1000,
  }
}
