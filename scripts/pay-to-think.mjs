// scripts/pay-to-think.mjs — one-shot LIVE demo: Cronus pays an upstream data provider on Arc testnet.
// Signs LOCALLY with a funded testnet key YOU provide via env (never hardcoded, never sent anywhere).
// Usage: UPSTREAM_PAYER_KEY=0x... TO=0x... AMOUNT_ATOMIC=20000 node scripts/pay-to-think.mjs
import { createWalletClient, createPublicClient, http, defineChain, erc20Abi, getAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const USDC = process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000"
const EXPLORER = process.env.ARC_EXPLORER || "https://testnet.arcscan.app"
const CHAIN_ID = Number(process.env.ARC_CHAIN_ID || "5042002")
const PK = process.env.UPSTREAM_PAYER_KEY || process.env.STAKE_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY
const TO = process.env.TO
const AMOUNT = process.env.AMOUNT_ATOMIC || "20000"

if (!PK) { console.error("Set UPSTREAM_PAYER_KEY (a funded Arc testnet key)"); process.exit(1) }
if (!TO) { console.error("Set TO (upstream provider address)"); process.exit(1) }

const arcChain = defineChain({ id: CHAIN_ID, name: "arc-testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const account = privateKeyToAccount(PK.startsWith("0x") ? PK : "0x" + PK)
const pub = createPublicClient({ chain: arcChain, transport: http(RPC) })
const wallet = createWalletClient({ account, chain: arcChain, transport: http(RPC) })
const to = getAddress(TO)
const amt = BigInt(AMOUNT)

console.log("Cronus pay-to-think LIVE: paying", amt.toString(), "atomic USDC ->", to, "from", account.address)
const hash = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer", args: [to, amt] })
console.log("tx:", hash)
const rc = await pub.waitForTransactionReceipt({ hash })
console.log("status:", rc.status, "| explorer:", EXPLORER + "/tx/" + hash)
