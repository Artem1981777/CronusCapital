import { createRequire } from "module"
const require = createRequire(import.meta.url)
const { ethers } = require("ethers")

const RPC = "https://rpc.testnet.arc.network"
const USDC = "0x3600000000000000000000000000000000000000"
const VAULT = "0x13B6984357e27dAB17DF44a6396042239e70542C"
const PK = process.env.TREASURY_PRIVATE_KEY
const AMT = process.env.YIELD_USDC || "0.1"

if (!PK) { console.error("Set TREASURY_PRIVATE_KEY"); process.exit(1) }

const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address a) view returns (uint256)"
]
const VAULT_ABI = [
  "function addYield(uint256 amount)",
  "function totalAssets() view returns (uint256)"
]

const provider = new ethers.JsonRpcProvider(RPC)
const wallet = new ethers.Wallet(PK, provider)
const usdc = new ethers.Contract(USDC, USDC_ABI, wallet)
const vault = new ethers.Contract(VAULT, VAULT_ABI, wallet)

const amount = ethers.parseUnits(AMT, 6)
console.log("Owner:", wallet.address, "| adding yield:", AMT, "USDC")

const a = await usdc.approve(VAULT, amount)
console.log("approve tx:", a.hash)
await a.wait()

const y = await vault.addYield(amount)
console.log("addYield tx:", y.hash)
await y.wait()

const ta = await vault.totalAssets()
console.log("=== YIELD ADDED ===")
console.log("Vault totalAssets now:", ethers.formatUnits(ta, 6), "USDC")
