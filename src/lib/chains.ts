// src/lib/chains.ts
// Central, MAINNET-ONLY network registry for the whole Cronus site.
// Only Arc Mainnet is supported. If a wallet is on any other network
// (testnet or otherwise), the UI refuses to act and offers to switch to Arc.

export type ChainMeta = {
  id: number
  hexId: string
  name: string
  rpcUrls: string[]
  explorer: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
}

export const ARC_CHAIN_ID = 5042
export const SUPPORTED_CHAINS: Record<number, ChainMeta> = {
  5042: { id: 5042, hexId: "0x13b2", name: "Arc", rpcUrls: ["https://rpc.mainnet.arc.io"], explorer: "https://explorer.arc.io", nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 } },
}

export function isSupportedChain(id: number | undefined | null): boolean {
  return !!id && Object.prototype.hasOwnProperty.call(SUPPORTED_CHAINS, id)
}

type SwitchFn = (args: { chainId: number }) => Promise<unknown>
type EnsureOpts = { switchChainAsync?: SwitchFn; getProvider?: () => Promise<any> | any }

// Move the connected wallet onto `targetId`, adding the network first if the
// wallet does not know it yet. Talks to the wallet's own EIP-1193 provider so it
// keeps working on mobile wallets whose wagmi connector lacks getChainId.
export async function ensureChain(targetId: number, opts: EnsureOpts = {}): Promise<void> {
  const meta = SUPPORTED_CHAINS[targetId]
  if (!meta) throw new Error("Refusing to switch: " + targetId + " is not a supported network.")

  let provider: any = null
  try { provider = opts.getProvider ? await opts.getProvider() : null } catch { provider = null }
  if (!provider && typeof window !== "undefined") provider = (window as any).ethereum

  if (provider && typeof provider.request === "function") {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: meta.hexId }] })
      return
    } catch (e: any) {
      const code = e?.code ?? e?.data?.originalError?.code
      const msg = String(e?.message || "")
      if (code === 4902 || code === -32603 || /unrecognized|not been added|add.*chain/i.test(msg)) {
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
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: meta.hexId }] })
        return
      }
      if (code === 4001) throw new Error("Network switch was rejected in your wallet.")
      // fall through to wagmi fallback
    }
  }

  if (opts.switchChainAsync) { await opts.switchChainAsync({ chainId: targetId }); return }
  throw new Error("No wallet provider available to switch networks.")
}
