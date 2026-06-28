import { createWalletClient, createPublicClient, http, defineChain } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const BASE = process.env.CRONUS_URL || "https://cronus-capital.vercel.app"
const PK = process.env.BUYER_PRIVATE_KEY
if (!PK) { console.error("Set BUYER_PRIVATE_KEY to a funded wallet (NOT the treasury) with a little Arc testnet USDC."); process.exit(1) }
const MAX_USD = Number(process.env.BUYER_MAX_USD || "0.05")

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

console.log("Cronus external payment — one command")
console.log("  buyer wallet:", account.address)
console.log("  topic:", topic)

const r1 = await fetch(url)
if (r1.status !== 402) { console.error("Expected HTTP 402, got", r1.status); console.error(await r1.text()); process.exit(1) }
const reqs = await r1.json()
const acc = (reqs.accepts && reqs.accepts[0]) || {}
const priceUsd = Number(acc.maxAmountRequired || "0") / 1e6
console.log("  402 Payment Required ->", priceUsd, "USDC to", acc.payTo)
if (priceUsd > MAX_USD) { console.error("ABORT: price " + priceUsd + " exceeds budget " + MAX_USD + " (raise via BUYER_MAX_USD)."); process.exit(2) }

const hash = await wallet.writeContract({ address: acc.asset, abi: ERC20, functionName: "transfer", args: [acc.payTo, BigInt(acc.maxAmountRequired)] })
console.log("  paid. tx:", hash)
console.log("  explorer: https://testnet.arcscan.app/tx/" + hash)
await pub.waitForTransactionReceipt({ hash })
console.log("  confirmed. claiming signal with on-chain proof...")

const r2 = await fetch(url, { headers: { "X-PAYMENT": hash } })
const out = await r2.json().catch(() => ({}))
console.log("  claim HTTP", r2.status)
if (out && out.report) console.log("  verdict:", out.report.verdict, "| conviction:", out.report.conviction)
else console.log(JSON.stringify(out, null, 2))

console.log("")
console.log("Real external on-chain payment to Cronus. Verify:")
console.log("  your tx:  https://testnet.arcscan.app/tx/" + hash)
console.log("  traction: " + BASE + "/api/traction  (standard.payments)")
console.log("  (for the NANO external-payer leaderboard, pay via: node scripts/buyer-agent.mjs)")
