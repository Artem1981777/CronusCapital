// scripts/register-rhea.mjs - one-off: register Rhea in the ERC-8004 identity registry.
// Usage: RHEA_PRIVATE_KEY=0x... node scripts/register-rhea.mjs
import { createWalletClient, createPublicClient, http, defineChain } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const RPC = process.env.ARC_RPC || "https://rpc.blockdaemon.testnet.arc.network"
const REGISTRY = process.env.IDENTITY_REGISTRY || "0x252cAA46b9b0648908000f6C87e0a561DB4dEb6c"
const DOMAIN = "cronus-capital.vercel.app"
const METADATA = "https://github.com/Artem1981777/CronusCapital/tree/main/m2m-ledger"

const PK = process.env.RHEA_PRIVATE_KEY
if (!PK) { console.error("Set RHEA_PRIVATE_KEY"); process.exit(1) }

const arc = defineChain({
  id: 5042002,
  name: "arc-testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
})

const abi = [
  { name: "register", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "agentAddress", type: "address" }, { name: "agentDomain", type: "string" }, { name: "metadataURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }] },
  { name: "isRegistered", type: "function", stateMutability: "view",
    inputs: [{ name: "agentAddress", type: "address" }], outputs: [{ type: "bool" }] },
]

const account = privateKeyToAccount(PK.startsWith("0x") ? PK : "0x" + PK)
const pub = createPublicClient({ chain: arc, transport: http(RPC) })
const wal = createWalletClient({ account, chain: arc, transport: http(RPC) })

console.log("Rhea address:", account.address)
const already = await pub.readContract({ address: REGISTRY, abi, functionName: "isRegistered", args: [account.address] })
if (already) { console.log("Already registered - nothing to do"); process.exit(0) }

const hash = await wal.writeContract({ address: REGISTRY, abi, functionName: "register", args: [account.address, DOMAIN, METADATA] })
console.log("register tx:", hash)
const rc = await pub.waitForTransactionReceipt({ hash })
console.log("mined, block", rc.blockNumber.toString(), "status", rc.status)
console.log("isRegistered now:", await pub.readContract({ address: REGISTRY, abi, functionName: "isRegistered", args: [account.address] }))
