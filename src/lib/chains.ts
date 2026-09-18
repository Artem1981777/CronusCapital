// src/lib/chains.ts
// Central, MAINNET-ONLY network registry for the whole Cronus site.
// Arc Mainnet and Base Mainnet are supported. Other networks are refused.

export type ChainMeta = {
  id: number
  hexId: string
  name: string
  rpcUrls: string[]
  explorer: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
}

export const ARC_CHAIN_ID = 5042
export const BASE_CHAIN_ID = 8453

export const SUPPORTED_CHAINS: Record<number, ChainMeta> = {
  5042: {
    id: 5042,
    hexId: "0x13b2",
    name: "Arc Mainnet",
    rpcUrls: ["https://rpc.mainnet.arc.io"],
    explorer: "https://explorer.arc.io",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  },
  8453: {
    id: 8453,
    hexId: "0x2105",
    name: "Base Mainnet",
    rpcUrls: ["https://mainnet.base.org"],
    explorer: "https://basescan.org",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
}

export function isSupportedChain(id: number | undefined | null): boolean {
  return !!id && Object.prototype.hasOwnProperty.call(SUPPORTED_CHAINS, id)
}

type SwitchFn = (args: { chainId: number }) => Promise<unknown>

type Eip1193Provider = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>
}

type EnsureOpts = {
  switchChainAsync?: SwitchFn
  getProvider?: () => Promise<unknown> | unknown
}

function asEip1193Provider(value: unknown): Eip1193Provider | null {
  if (typeof value !== "object" || value === null) return null
  const candidate = value as { request?: unknown }
  return typeof candidate.request === "function"
    ? (value as Eip1193Provider)
    : null
}

type SwitchError = {
  code?: number
  data?: { originalError?: { code?: number } }
  message?: string
}

// Move the connected wallet onto targetId, adding the network first if the
// wallet does not know it yet. Works with mobile EIP-1193 providers.
export async function ensureChain(
  targetId: number,
  opts: EnsureOpts = {},
): Promise<void> {
  const meta = SUPPORTED_CHAINS[targetId]
  if (!meta) {
    throw new Error("Refusing to switch: " + targetId + " is not a supported network.")
  }

  let provider: Eip1193Provider | null = null

  try {
    const provided = opts.getProvider ? await opts.getProvider() : null
    provider = asEip1193Provider(provided)
  } catch {
    // Keep the initial null provider and use the browser fallback below.
  }

  if (!provider && typeof window !== "undefined") {
    provider = (window as Window & { ethereum?: Eip1193Provider }).ethereum ?? null
  }

  if (provider) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: meta.hexId }],
      })
      return
    } catch (e: unknown) {
      const error = e as SwitchError
      const code = error.code ?? error.data?.originalError?.code
      const msg = String(error.message || "")

      if (
        code === 4902 ||
        code === -32603 ||
        /unrecognized|not been added|add.*chain/i.test(msg)
      ) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: meta.hexId,
            chainName: meta.name,
            nativeCurrency: meta.nativeCurrency,
            rpcUrls: meta.rpcUrls,
            blockExplorerUrls: [meta.explorer],
          }],
        })

        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: meta.hexId }],
        })
        return
      }

      if (code === 4001) {
        throw new Error("Network switch was rejected in your wallet.", { cause: e })
      }
    }
  }

  if (opts.switchChainAsync) {
    await opts.switchChainAsync({ chainId: targetId })
    return
  }

  throw new Error("No wallet provider available to switch networks.")
}
