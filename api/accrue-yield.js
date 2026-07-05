import { createWalletClient, createPublicClient, http, defineChain, parseUnits } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const arc = defineChain( {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ "https://rpc.testnet.arc.network" ] } }
} )

const USDC = "0x3600000000000000000000000000000000000000"
const VAULT = "0x13B6984357e27dAB17DF44a6396042239e70542C"

const ERC20 = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [ { name: "s", type: "address" }, { name: "a", type: "uint256" } ], outputs: [ { name: "", type: "bool" } ] }
]
const VAULT_ABI = [
  { type: "function", name: "addYield", stateMutability: "nonpayable", inputs: [ { name: "a", type: "uint256" } ], outputs: [] },
  { type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [ { name: "", type: "uint256" } ] }
]

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json( { ok: false, error: "method not allowed" } ); return }
  if (process.env.ALLOW_SYNTHETIC_YIELD !== "1") { res.status(410).json({ ok: false, disabled: true, error: "synthetic yield accrual disabled; vault yield must reflect real strategy P&L" }); return }
  const pk = process.env.TREASURY_PRIVATE_KEY
  if (!pk) { res.status(500).json( { ok: false, error: "treasury not configured" } ); return }
  try {
    const account = privateKeyToAccount(pk.startsWith("0x") ? pk : "0x" + pk)
    const wallet = createWalletClient( { account, chain: arc, transport: http() } )
    const pub = createPublicClient( { chain: arc, transport: http() } )
    const pnl = (0.02 + Math.random() * 0.05).toFixed(4)
    const amount = parseUnits(pnl, 6)
    const aHash = await wallet.writeContract( { address: USDC, abi: ERC20, functionName: "approve", args: [ VAULT, amount ] } )
    await pub.waitForTransactionReceipt( { hash: aHash } )
    const yHash = await wallet.writeContract( { address: VAULT, abi: VAULT_ABI, functionName: "addYield", args: [ amount ] } )
    await pub.waitForTransactionReceipt( { hash: yHash } )
    const ta = await pub.readContract( { address: VAULT, abi: VAULT_ABI, functionName: "totalAssets" } )
    res.status(200).json( { ok: true, hash: yHash, amount: pnl, totalAssets: Number(ta) / 1e6 } )
  } catch (e) {
    res.status(500).json( { ok: false, error: String((e && e.shortMessage) || (e && e.message) || e).slice(0, 200) } )
  }
}
