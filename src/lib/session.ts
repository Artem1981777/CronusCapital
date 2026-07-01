// src/lib/session.ts — ephemeral browser session-key for popup-free Circle Gateway nano-streaming.
// Session key is generated in memory (never persisted). The MAIN wallet funds the session key's
// Gateway balance ONCE via depositFor; afterwards the session key signs gas-free EIP-3009 nano
// authorizations with NO wallet popups. Honest: real Gateway settlements, hard budget + TTL caps.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { decideTick } from "./sessionGuard"
import { GatewayClient } from "@circle-fin/x402-batching/client"
import type { Address, Hex } from "viem"

export const ARC = {
  chainId: 5042002,
  usdc: "0x3600000000000000000000000000000000000000" as Address,
  gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as Address,
  gatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B" as Address,
}

// One-popup funding call made by the MAIN wallet (wagmi): credits the session key's Gateway balance.
export const GATEWAY_DEPOSIT_ABI = [
  {
    type: "function",
    name: "depositFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "depositor", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
] as const

export const ERC20_ALLOWANCE_APPROVE_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const

export type SessionKey = { privateKey: Hex; address: Address; createdAt: number }

export function createSession(): SessionKey {
  const privateKey = generatePrivateKey()
  const address = privateKeyToAccount(privateKey).address
  return { privateKey, address, createdAt: Date.now() }
}

export type StreamTick = {
  i: number
  ok: boolean
  amountUsd: number
  settlement: string | null
  verdict?: string
  error?: string
}

export type StreamOpts = {
  privateKey: Hex
  resource: string
  topic?: string
  seconds: number
  perTickUsd: number
  budgetUsd: number
  perTxCapUsd?: number
  ttlMs?: number
  onTick?: (t: StreamTick) => void
  shouldStop?: () => boolean
}

export type StreamResult = {
  attempted: number
  delivered: number
  spentUsd: number
  settlements: string[]
  stoppedReason: string
}

export async function streamPay(opts: StreamOpts): Promise<StreamResult> {
  const topic = opts.topic ?? "BTC-USDC momentum"
  const perTxCapUsd = opts.perTxCapUsd ?? opts.perTickUsd
  const ttlMs = opts.ttlMs ?? 5 * 60 * 1000
  const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: opts.privateKey })
  const deadline = Date.now() + ttlMs
  const settlements: string[] = []
  let spent = 0
  let delivered = 0
  let attempted = 0
  let stoppedReason = "completed"
  for (let i = 1; i <= opts.seconds; i++) {
    const gate = decideTick({ stopped: !!(opts.shouldStop && opts.shouldStop()), now: Date.now(), deadline, perTickUsd: opts.perTickUsd, perTxCapUsd, spentUsd: spent, budgetUsd: opts.budgetUsd })
      if (!gate.proceed) { stoppedReason = gate.reason; break }
    attempted++
    const t0 = Date.now()
    const tick: StreamTick = { i, ok: false, amountUsd: 0, settlement: null }
    try {
      const sep = opts.resource.includes("?") ? "&" : "?"
      const url = opts.resource + sep + "topic=" + encodeURIComponent(topic) + "&stream=" + i
      const r = await gateway.pay<{ report?: { verdict?: string } }>(url)
      const paid = Number(r.formattedAmount) || opts.perTickUsd
      spent += paid
      tick.ok = true
      tick.amountUsd = paid
      tick.settlement = r.transaction || null
      const verdict = r.data.report?.verdict
      if (verdict) { delivered++; tick.verdict = verdict }
      if (r.transaction) settlements.push(r.transaction)
    } catch (e) {
      tick.error = String(e instanceof Error ? e.message : e).slice(0, 140)
    }
    if (opts.onTick) opts.onTick(tick)
    const dt = Date.now() - t0
    if (dt < 1000) await new Promise((res) => setTimeout(res, 1000 - dt))
  }
  return { attempted, delivered, spentUsd: Number(spent.toFixed(6)), settlements, stoppedReason }
}
