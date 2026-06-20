import { createWalletClient, createPublicClient, http, defineChain } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const BASE = process.env.CRONUS_URL || "https://cronus-capital.vercel.app"
const PK = process.env.BUYER_PRIVATE_KEY
if (!PK) { console.error("Set BUYER_PRIVATE_KEY to a SECOND wallet (not the treasury), funded with a little Arc testnet USDC."); process.exit(1) }

const arc = defineChain({
  id: 5042002, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
})
const account = privateKeyToAccount(PK.startsWith("0x") ? PK : "0x" + PK)
const pub = createPublicClient({ chain: arc, transport: http() })
const wallet = createWalletClient({ account, chain: arc, transport: http() })
const ERC20 = [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] }]

const topic = process.argv[2] || "BTC-USDC momentum"
const url = BASE + "/api/signal?topic=" + encodeURIComponent(topic)

console.log("Buyer wallet:", account.address)
const r1 = await fetch(url)
if (r1.status !== 402) { console.error("Expected 402, got", r1.status); console.error(await r1.text()); process.exit(1) }
const reqs = await r1.json()
const acc = reqs.accepts[0]
console.log("402 Payment Required ->", acc.maxAmountRequired, "atomic USDC to", acc.payTo)

const hash = await wallet.writeContract({ address: acc.asset, abi: ERC20, functionName: "transfer", args: [acc.payTo, BigInt(acc.maxAmountRequired)] })
console.log("Paid. tx:", hash)
console.log("Explorer: https://testnet.arcscan.app/tx/" + hash)
await pub.waitForTransactionReceipt({ hash })
console.log("Confirmed. Claiming signal with proof...")

const r2 = await fetch(url, { headers: { "X-PAYMENT": hash } })
console.log("HTTP", r2.status)
console.log(JSON.stringify(await r2.json(), null, 2))
