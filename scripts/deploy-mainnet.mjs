import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import solc from "solc"
import { ethers } from "ethers"

const CHAIN_ID = 5042
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io"
const USDC = process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000"
const DEPLOYER_KEY = process.env.CRONUS_WALLET_KEY
const DEPLOYER_EXPECTED = (process.env.DEPLOYER_ADDRESS || "0xd4939e42bd3e0ec9cb00091778a331c35d1834aa").toLowerCase()
const OUT = process.env.DEPLOYMENT_FILE || "deployments/Cronus-mainnet.json"
const DOMAIN = process.env.AGENT_DOMAIN || "cronus-capital.vercel.app"
const METADATA = process.env.METADATA_URI || "https://cronus-capital.vercel.app/api/manifest"
const NO_DEPLOY = process.argv.includes("--dry-run")
const ZERO = ethers.ZeroAddress

if (!DEPLOYER_KEY && !NO_DEPLOY) throw new Error("CRONUS_WALLET_KEY is required")

const provider = new ethers.JsonRpcProvider(RPC, { chainId: CHAIN_ID, name: "arc" }, { staticNetwork: true })
const network = await provider.getNetwork()
if (Number(network.chainId) !== CHAIN_ID) throw new Error(`Wrong chain: expected ${CHAIN_ID}, got ${network.chainId}`)
const wallet = DEPLOYER_KEY ? new ethers.Wallet(DEPLOYER_KEY, provider) : null
if (!NO_DEPLOY && wallet.address.toLowerCase() !== DEPLOYER_EXPECTED) throw new Error(`Wrong deployer: expected ${DEPLOYER_EXPECTED}, got ${wallet.address}`)
const code = await provider.getCode(USDC)
if (code === "0x") throw new Error(`USDC contract has no code at ${USDC}`)
const balance = wallet ? await provider.getBalance(wallet.address) : 0n
console.log(`Arc Mainnet chainId=${CHAIN_ID}`)
console.log(`deployer=${wallet?.address || DEPLOYER_EXPECTED} (dry-run placeholder)`)
console.log(`native USDC gas balance=${ethers.formatUnits(balance, 18)}`)
if (!NO_DEPLOY && balance < ethers.parseUnits("0.25", 18)) throw new Error("Refusing to deploy with less than 0.25 native USDC gas balance")

const compile = (file, contract) => {
  const content = readFileSync(`contracts/${file}`, "utf8")
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: "Solidity",
    sources: { [file]: { content } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  })))
  const errors = (out.errors || []).filter((e) => e.severity === "error")
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"))
  const c = out.contracts[file][contract]
  return { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` }
}

mkdirSync("deployments", { recursive: true })
const result = {
  contract: "Cronus Capital",
  network: "arc-mainnet",
  chainId: CHAIN_ID,
  rpc: RPC,
  explorer: "https://explorer.arc.io",
  deployer: wallet?.address || DEPLOYER_EXPECTED,
  multisig: { status: "deferred", note: "Temporary deployer ownership; migrate privileged roles to 2-of-3 multisig before production funds are held." },
  contracts: {},
  transactions: [],
  startedAt: new Date().toISOString(),
}

const deploy = async (key, file, name, args = []) => {
  const { abi, bytecode } = compile(file, name)
  console.log(`${key}: compiled (${Math.round((bytecode.length - 2) / 2)} bytes)`)
  if (NO_DEPLOY) return
  const factory = new ethers.ContractFactory(abi, bytecode, wallet)
  const c = await factory.deploy(...args)
  const tx = c.deploymentTransaction()
  console.log(`${key}: tx ${tx.hash}`)
  result.transactions.push({ key, hash: tx.hash })
  await c.waitForDeployment()
  const address = await c.getAddress()
  result.contracts[key] = { address, source: `contracts/${file}`, constructorArgs: args.map(String), txHash: tx.hash, explorer: `https://explorer.arc.io/address/${address}` }
  writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n")
  console.log(`${key}: ${address}`)
  return { address, abi }
}

if (NO_DEPLOY) {
  for (const [key, file, name, args] of [
    ["identityRegistry", "CronusIdentityRegistry.sol", "CronusIdentityRegistry", []],
    ["decisions", "CronusDecisions.sol", "CronusDecisions", []],
    ["vault", "CronusVault.sol", "CronusVault", [USDC]],
    ["jobEscrow", "CronusJobEscrow.sol", "CronusJobEscrow", [USDC, ZERO]],
    ["reputation", "CronusReputation.sol", "CronusReputation", [ZERO]],
    ["agentGuardV2", "CronusAgentGuardV2.sol", "CronusAgentGuardV2", [USDC, DEPLOYER_EXPECTED, DEPLOYER_EXPECTED, DEPLOYER_EXPECTED, DEPLOYER_EXPECTED, 100000n, 500000n, 1000000n, 5000000n, 86400n]],
    ["drillCertificate", "CronusDrillCertificate.sol", "CronusDrillCertificate", [DEPLOYER_EXPECTED, DEPLOYER_EXPECTED, DEPLOYER_EXPECTED, ZERO]],
    ["accessPass", "CronusAccessPass.sol", "CronusAccessPass", [USDC, DEPLOYER_EXPECTED, ZERO, 2000000n, 30n * 86400n, 5000000n]],
    ["cronusToken", "CronusSwap.sol", "CronusToken", [1000000n * 1000000n]],
    ["cronusSwap", "CronusSwap.sol", "CronusSwap", [USDC, DEPLOYER_EXPECTED]],
  ]) compile(file, name)
  console.log("DRY RUN OK: all non-multisig contracts compiled; no transactions sent")
  process.exit(0)
}

const identity = await deploy("identityRegistry", "CronusIdentityRegistry.sol", "CronusIdentityRegistry")
await deploy("decisions", "CronusDecisions.sol", "CronusDecisions")
await deploy("vault", "CronusVault.sol", "CronusVault", [USDC])
await deploy("jobEscrow", "CronusJobEscrow.sol", "CronusJobEscrow", [USDC, identity.address])
await deploy("reputation", "CronusReputation.sol", "CronusReputation", [identity.address])
const guard = await deploy("agentGuardV2", "CronusAgentGuardV2.sol", "CronusAgentGuardV2", [USDC, wallet.address, wallet.address, wallet.address, wallet.address, 100000n, 500000n, 1000000n, 5000000n, 86400n])
const cert = await deploy("drillCertificate", "CronusDrillCertificate.sol", "CronusDrillCertificate", [wallet.address, wallet.address, wallet.address, guard.address])
await deploy("accessPass", "CronusAccessPass.sol", "CronusAccessPass", [USDC, wallet.address, cert.address, 2000000n, 30n * 86400n, 5000000n])
const token = await deploy("cronusToken", "CronusSwap.sol", "CronusToken", [1000000n * 1000000n])
await deploy("cronusSwap", "CronusSwap.sol", "CronusSwap", [USDC, token.address])
result.finishedAt = new Date().toISOString()
writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n")
console.log(`DONE: ${OUT}`)
console.log("NOTE: CronusMultisig was intentionally skipped; migrate owners before holding production funds.")
console.log(`agent domain=${DOMAIN} metadata=${METADATA}`)
console.log("No initial liquidity was added.")
