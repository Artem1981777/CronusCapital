import { createWalletClient, createPublicClient, http, defineChain } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const BASE = process.env.CRONUS_URL || "https://cronus-capital.vercel.app"
const DRY = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run")
const MAX_USD = Number(process.env.BUYER_MAX_USD || "0.05")
const topic = process.argv.filter((a) => !a.startsWith("--"))[2] || "BTC-USDC momentum"
const url = BASE + "/api/signal?topic=" + encodeURIComponent(topic)

const arc = defineChain({
  id: 5042002, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
})
const ERC20 = [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] }]

console.log("Cronus Capital — pay as an EXTERNAL agent (one command)")
console.log("  endpoint:", url)

const r1 = await fetch(url)
if (r1.status !== 402) { console.error("Expected HTTP 402, got", r1.status); console.error(await r1.text()); process.exit(1) }
const reqs = await r1.json()
const acc = (reqs.accepts && reqs.accepts[0]) || {}
const priceUsd = Number(acc.maxAmountRequired || "0") / 1e6
console.log("  402 Payment Required ->", priceUsd, "USDC to", acc.payTo, "(" + (acc.network || "arc-testnet") + ")")

if (DRY) {
  console.log("")
  console.log("[dry-run] discovery only — no payment sent.")
  console.log("To pay for real: set EXTERNAL_PRIVATE_KEY (a wallet YOU funded, not a Cronus wallet) and re-run without --dry-run.")
  process.exit(0)
}

const PK = process.env.EXTERNAL_PRIVATE_KEY || process.env.BUYER_PRIVATE_KEY
if (!PK) { console.error("Set EXTERNAL_PRIVATE_KEY to a self-funded wallet with a little Arc testnet USDC."); process.exit(1) }
if (priceUsd > MAX_USD) { console.error("ABORT: price " + priceUsd + " exceeds budget " + MAX_USD + "."); process.exit(2) }

const account = privateKeyToAccount(PK.startsWith("0x") ? PK : "0x" + PK)
const pub = createPublicClient({ chain: arc, transport: http() })
const wallet = createWalletClient({ account, chain: arc, transport: http() })
console.log("  payer wallet:", account.address)

const hash = await wallet.writeContract({ address: acc.asset, abi: ERC20, functionName: "transfer", args: [acc.payTo, BigInt(acc.maxAmountRequired)] })
console.log("  paid. tx:", hash)
await pub.waitForTransactionReceipt({ hash })
console.log("  confirmed. claiming signal with on-chain proof...")

const r2 = await fetch(url, { headers: { "X-PAYMENT": hash } })
const out = await r2.json().catch(() => ({}))
console.log("  claim HTTP", r2.status)
if (out && out.report) console.log("  verdict:", out.report.verdict, "| conviction:", out.report.conviction)

console.log("")
console.log("Real external on-chain payment. To be counted in external_payers:")
console.log("  1) tx:       https://testnet.arcscan.app/tx/" + hash)
console.log("  2) receipts: " + BASE + "/api/receipts  (payer = " + account.address + ")")
console.log("  3) prove independence: node scripts/audit-funders.mjs")
console.log("  4) once verified -> added to VERIFIED_EXTERNAL_PAYERS, shown at " + BASE + "/api/traction")
