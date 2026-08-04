// src/lib/chains.ts
// Central, TESTNET-ONLY network registry for the whole Cronus site.
// Mainnets are deliberately excluded. If a wallet is on an unsupported network
// (e.g. Ethereum mainnet, chainId 1), the UI refuses to act and offers to switch.

export type ChainMeta = {
  id: number
  hexId: string
  name: string
  rpcUrls: string[]
  explorer: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
}

export const ARC_CHAIN_ID = 5042002

export const SUPPORTED_CHAINS: Record<number, ChainMeta> = {
  5042002: { id: 5042002, hexId: "0x4cef52", name: "Arc Testnet", rpcUrls: ["https://rpc.testnet.arc.network"], explorer: "https://testnet.arcscan.app", nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 } },
  84532: { id: 84532, hexId: "0x14a34", name: "Base Sepolia", rpcUrls: ["https://sepolia.base.org"], explorer: "https://sepolia.basescan.org", nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 } },
  11155111: { id: 11155111, hexId: "0xaa36a7", name: "Ethereum Sepolia", rpcUrls: ["https://rpc.sepolia.org"], explorer: "https://sepolia.etherscan.io", nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 } },
  421614: { id: 421614, hexId: "0x66eee", name: "Arbitrum Sepolia", rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"], explorer: "https://sepolia.arbiscan.io", nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 } },
  11155420: { id: 11155420, hexId: "0xaa37dc", name: "OP Sepolia", rpcUrls: ["https://sepolia.optimism.io"], explorer: "https://sepolia-optimism.etherscan.io", nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 } },
  43113: { id: 43113, hexId: "0xa869", name: "Avalanche Fuji", rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"], explorer: "https://testnet.snowtrace.io", nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 } },
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
  if (!meta) throw new Error("Refusing to switch: " + targetId + " is not a supported testnet.")

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
