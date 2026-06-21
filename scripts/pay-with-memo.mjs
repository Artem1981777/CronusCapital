// scripts/pay-with-memo.mjs
// Pay for a Cronus signal THROUGH Arc's transaction-memo wrapper, attaching a
// reconcilable on-chain reference, then consume the x402 paywall.
import {
  createPublicClient, createWalletClient, http,
  encodeFunctionData, erc20Abi, keccak256, stringToHex, parseEventLogs, getAddress,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"

const RPC_URL = process.env.RPC_URL || "https://rpc.testnet.arc.network"
const PK = process.env.BUYER_PRIVATE_KEY
const CRONUS_URL = process.env.CRONUS_URL || "https://cronus-capital.vercel.app"
const TOPIC = process.argv[2] || "BTC-USDC momentum"

if (!PK) { console.error("Set BUYER_PRIVATE_KEY"); process.exit(1) }

const MEMO_ADDRESS = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505"
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000"
const CHAIN_ID = 5042002

const memoAbi = [
  { type: "function", name: "memo", stateMutability: "nonpayable", inputs: [
    { name: "target", type: "address" },
    { name: "data", type: "bytes" },
    { name: "memoId", type: "bytes32" },
    { name: "memoData", type: "bytes" },
  ], outputs: [] },
  { type: "event", name: "Memo", anonymous: false, inputs: [
    { name: "sender", type: "address", indexed: true },
    { name: "target", type: "address", indexed: true },
    { name: "callDataHash", type: "bytes32", indexed: false },
    { name: "memoId", type: "bytes32", indexed: true },
    { name: "memo", type: "bytes", indexed: false },
    { name: "memoIndex", type: "uint256", indexed: false },
  ] },
]

const chain = {
  id: CHAIN_ID, name: "arc-testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
}

const account = privateKeyToAccount(PK)
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain, transport: http(RPC_URL) })

async function main() {
  const url = CRONUS_URL + "/api/signal?topic=" + encodeURIComponent(TOPIC)

  // 1) Ask Cronus for the price (expect HTTP 402 + accepts[])
  const r1 = await fetch(url)
  console.log("Initial status:", r1.status, "(expected 402)")
  const reqs = await r1.json()
  const accept = (reqs.accepts && reqs.accepts[0]) || {}
  const payTo = getAddress(accept.payTo)
  const amount = BigInt(accept.maxAmountRequired || "20000")
  console.log("Price:", amount.toString(), "atomic USDC ->", payTo, "on", accept.network)

  // 2) Wrap the USDC transfer in a memo (preserves our wallet as sender)
  const transferData = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [payTo, amount] })
  const reference = "cronus|signal|" + TOPIC + "|" + Date.now()
  const memoId = keccak256(stringToHex("cronus-signal:" + TOPIC))
  const memoData = stringToHex(reference)
  console.log("Memo reference:", reference)

  const hash = await walletClient.writeContract({
    address: MEMO_ADDRESS, abi: memoAbi, functionName: "memo",
    args: [USDC_ADDRESS, transferData, memoId, memoData],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") { console.error("Memo tx reverted:", hash); process.exit(1) }
  console.log("Paid + memo tx:", "https://testnet.arcscan.app/tx/" + hash)

  // 3) Decode the on-chain Memo event as proof
  const memos = parseEventLogs({ abi: memoAbi, logs: receipt.logs }).filter((e) => e.eventName === "Memo")
  if (memos.length) {
    const a = memos[0].args
    console.log("Memo event -> memoId:", a.memoId, "| sender:", a.sender, "| memo(bytes):", a.memo)
  } else {
    console.log("WARN: no Memo event decoded (check contract address)")
  }

  // 4) Retry the paywall with X-PAYMENT to unlock the signal
  const r2 = await fetch(url, { headers: { "X-PAYMENT": hash } })
  const out = await r2.json()
  console.log("Paywall response:", JSON.stringify(out, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
