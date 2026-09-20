// Deploy the governance layer to Arc Mainnet and hand the guard to it.
//
// The first Mainnet deployment left every privileged role on the deployer key, and
// /api/governance has been publishing that as three failing invariants ever since.
// Two of them cannot be fixed in place: CronusAgentGuardV2.recovery is immutable, and
// CronusDrillCertificate binds its guard, operator, guardian and holder immutably too.
// So the fix is a fresh deployment of the governance-bound contracts with the roles
// separated from birth, not a setter call:
//
//   CronusMultisig(owners, threshold)                      <- new, owns the guard
//   CronusAgentGuardV2(..., owner=multisig, operator=hot, guardian=cold, recovery=cold)
//   CronusDrillCertificate(operator, guardian, holder=multisig, guard=newGuard)
//   CronusAccessPass(usdc, treasury, cert=newCert, ...)    <- follows the new certificate
//
// Nothing is abandoned by doing this: on Arc Mainnet the current guard, vault, pass and
// swap all hold 0 USDC and the pass has 0 minted tokens, so there is no user state to
// migrate — only addresses to republish. That is checked below rather than assumed: the
// script refuses to redeploy over a guard that holds funds or a pass that has holders.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import solc from "solc"
import { ethers } from "ethers"

const CHAIN_ID = 5042
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io"
const USDC = process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000"
const DEPLOYER_KEY = process.env.CRONUS_WALLET_KEY
const DEPLOYER_EXPECTED = (process.env.DEPLOYER_ADDRESS || "0xd4939e42bd3e0ec9cb00091778a331c35d1834aa").toLowerCase()
const OUT = process.env.DEPLOYMENT_FILE || "deployments/Cronus-mainnet.json"
const DRY_RUN = process.argv.includes("--dry-run")

// Role addresses. Every one of them must be supplied: defaulting a cold key to the
// deployer is exactly the state this script exists to end.
const OWNERS = (process.env.MULTISIG_OWNERS || "").split(",").map((s) => s.trim()).filter(Boolean)
const THRESHOLD = BigInt(process.env.MULTISIG_THRESHOLD || "2")
const OPERATOR = process.env.GUARD_OPERATOR || ""
const GUARDIAN = process.env.GUARD_GUARDIAN || ""
const RECOVERY = process.env.GUARD_RECOVERY || ""
const TREASURY = process.env.ACCESS_PASS_TREASURY || DEPLOYER_EXPECTED

// Caps stay exactly where the live guard has them, so this migration changes who holds
// the keys and nothing about how much the agent may spend.
const PER_TX_CAP = BigInt(process.env.GUARD_PER_TX_CAP || "100000")
const DAILY_CAP = BigInt(process.env.GUARD_DAILY_CAP || "500000")
const MAX_PER_TX_CAP = BigInt(process.env.GUARD_MAX_PER_TX_CAP || "1000000")
const MAX_DAILY_CAP = BigInt(process.env.GUARD_MAX_DAILY_CAP || "5000000")
const TIMELOCK = BigInt(process.env.GUARD_TIMELOCK || "86400")
const PASS_PRICE = BigInt(process.env.ACCESS_PASS_PRICE || "2000000")
const PASS_PERIOD = BigInt(process.env.ACCESS_PASS_PERIOD || String(30 * 86400))
const PASS_COVER_CAP = BigInt(process.env.ACCESS_PASS_COVER_CAP || "5000000")

const fail = (msg) => { throw new Error(msg) }
const norm = (a, label) => {
  if (!a) fail(`${label} is required`)
  if (!ethers.isAddress(a)) fail(`${label} is not an address: ${a}`)
  return ethers.getAddress(a)
}

const owners = OWNERS.map((o, i) => norm(o, `MULTISIG_OWNERS[${i}]`))
const operator = norm(OPERATOR, "GUARD_OPERATOR")
const guardian = norm(GUARDIAN, "GUARD_GUARDIAN")
const recovery = norm(RECOVERY, "GUARD_RECOVERY")
const treasury = norm(TREASURY, "ACCESS_PASS_TREASURY")

// The role split is validated here, before any gas is spent, against the same
// invariants /api/governance publishes. A deployment that would be born failing one of
// them is refused rather than shipped and explained away afterwards.
if (owners.length < 3) fail(`need at least 3 multisig owners, got ${owners.length}`)
if (new Set(owners.map((o) => o.toLowerCase())).size !== owners.length) fail("duplicate multisig owner")
if (THRESHOLD < 2n) fail("threshold must be at least 2: a 1-of-N multisig is a single key")
if (THRESHOLD > BigInt(owners.length)) fail("threshold exceeds owner count")
const lower = owners.map((o) => o.toLowerCase())
if (lower.includes(operator.toLowerCase())) fail("the operator hot key must not be a multisig signer")
if (lower.includes(recovery.toLowerCase())) fail("the recovery sink must not be a multisig signer")
if (operator.toLowerCase() === guardian.toLowerCase()) fail("operator and guardian must be different keys")
if (recovery.toLowerCase() === operator.toLowerCase()) fail("recovery must not be the operator")
if (recovery.toLowerCase() === guardian.toLowerCase()) fail("recovery must not be the guardian")
if (PER_TX_CAP > MAX_PER_TX_CAP || DAILY_CAP > MAX_DAILY_CAP) fail("live caps exceed the immutable hard ceilings")

console.log("governance migration plan")
console.log(`  multisig     ${THRESHOLD}-of-${owners.length}: ${owners.join(", ")}`)
console.log(`  operator     ${operator} (spend only)`)
console.log(`  guardian     ${guardian} (pause / veto only)`)
console.log(`  recovery     ${recovery} (immutable exit sink)`)
console.log(`  caps         ${Number(PER_TX_CAP) / 1e6} per tx / ${Number(DAILY_CAP) / 1e6} daily USDC, ceilings ${Number(MAX_PER_TX_CAP) / 1e6} / ${Number(MAX_DAILY_CAP) / 1e6}`)
console.log(`  timelock     ${TIMELOCK}s`)

const compile = (file, contract) => {
  const content = readFileSync(`contracts/${file}`, "utf8")
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: "Solidity",
    sources: { [file]: { content } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  })))
  const errors = (out.errors || []).filter((e) => e.severity === "error")
  if (errors.length) fail(errors.map((e) => e.formattedMessage).join("\n"))
  const c = out.contracts[file][contract]
  return { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` }
}

const UNITS = [
  ["multisig", "CronusMultisig.sol", "CronusMultisig"],
  ["agentGuardV2", "CronusAgentGuardV2.sol", "CronusAgentGuardV2"],
  ["drillCertificate", "CronusDrillCertificate.sol", "CronusDrillCertificate"],
  ["accessPass", "CronusAccessPass.sol", "CronusAccessPass"],
]
const compiled = Object.fromEntries(UNITS.map(([key, file, name]) => {
  const unit = compile(file, name)
  console.log(`${key}: compiled (${Math.round((unit.bytecode.length - 2) / 2)} bytes)`)
  return [key, unit]
}))

if (DRY_RUN && !DEPLOYER_KEY) {
  console.log("DRY RUN OK: role split validated and all four contracts compiled; no transactions sent")
  process.exit(0)
}

const provider = new ethers.JsonRpcProvider(RPC, { chainId: CHAIN_ID, name: "arc" }, { staticNetwork: true })
const network = await provider.getNetwork()
if (Number(network.chainId) !== CHAIN_ID) fail(`Wrong chain: expected ${CHAIN_ID}, got ${network.chainId}`)
if (!DEPLOYER_KEY) fail("CRONUS_WALLET_KEY is required")
const wallet = new ethers.Wallet(DEPLOYER_KEY, provider)
if (wallet.address.toLowerCase() !== DEPLOYER_EXPECTED) fail(`Wrong deployer: expected ${DEPLOYER_EXPECTED}, got ${wallet.address}`)
if ((await provider.getCode(USDC)) === "0x") fail(`USDC contract has no code at ${USDC}`)

const balance = await provider.getBalance(wallet.address)
console.log(`deployer=${wallet.address} gas balance=${ethers.formatUnits(balance, 18)} USDC`)
if (balance < ethers.parseUnits("0.2", 18)) fail("Refusing to deploy with less than 0.2 native USDC gas balance")

// Refuse to strand value. The superseded contracts must be empty, or this migration
// would republish an address while funds and pass holders stay behind on the old one.
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { contracts: {} }
const prevGuard = prev.contracts?.agentGuardV2?.address
const prevPass = prev.contracts?.accessPass?.address
if (prevGuard) {
  const held = await provider.getBalance(prevGuard)
  if (held > 0n) fail(`superseded guard ${prevGuard} still holds ${ethers.formatUnits(held, 18)} USDC; exit it to recovery first`)
}
if (prevPass) {
  const supply = await new ethers.Contract(prevPass, ["function totalSupply() view returns (uint256)"], provider).totalSupply()
  if (supply > 0n) fail(`superseded access pass ${prevPass} has ${supply} holder(s); migrating it would strand them`)
}

if (DRY_RUN) {
  console.log("DRY RUN OK: chain, deployer, gas balance and superseded-contract emptiness all check out; no transactions sent")
  process.exit(0)
}

const result = {
  ...prev,
  contract: "Cronus Capital",
  network: "arc-mainnet",
  chainId: CHAIN_ID,
  rpc: RPC,
  explorer: "https://explorer.arc.io",
  deployer: wallet.address,
  contracts: { ...(prev.contracts || {}) },
  transactions: [...(prev.transactions || [])],
  governanceMigration: { startedAt: new Date().toISOString(), supersedes: { agentGuardV2: prevGuard || null, drillCertificate: prev.contracts?.drillCertificate?.address || null, accessPass: prevPass || null } },
}
const save = () => writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n")

const deploy = async (key, file, args) => {
  const { abi, bytecode } = compiled[key]
  const factory = new ethers.ContractFactory(abi, bytecode, wallet)
  const c = await factory.deploy(...args)
  const tx = c.deploymentTransaction()
  console.log(`${key}: tx ${tx.hash}`)
  result.transactions.push({ key, hash: tx.hash })
  await c.waitForDeployment()
  const address = await c.getAddress()
  result.contracts[key] = { address, source: `contracts/${file}`, constructorArgs: args.map(String), txHash: tx.hash, explorer: `https://explorer.arc.io/address/${address}` }
  save()
  console.log(`${key}: ${address}`)
  return { address, abi }
}

const multisig = await deploy("multisig", "CronusMultisig.sol", [owners, THRESHOLD])
const guard = await deploy("agentGuardV2", "CronusAgentGuardV2.sol", [USDC, multisig.address, operator, guardian, recovery, PER_TX_CAP, DAILY_CAP, MAX_PER_TX_CAP, MAX_DAILY_CAP, TIMELOCK])
const cert = await deploy("drillCertificate", "CronusDrillCertificate.sol", [operator, guardian, multisig.address, guard.address])
await deploy("accessPass", "CronusAccessPass.sol", [USDC, treasury, cert.address, PASS_PRICE, PASS_PERIOD, PASS_COVER_CAP])

// Read the deployed state back off the chain. A deployment is only finished when the
// invariants the dashboard publishes are true of it, so they are asserted here against
// eth_call results rather than against the arguments we believe we passed.
const g = new ethers.Contract(guard.address, [
  "function owner() view returns (address)",
  "function operator() view returns (address)",
  "function guardian() view returns (address)",
  "function recovery() view returns (address)",
  "function timelockDelay() view returns (uint256)",
], provider)
const ms = new ethers.Contract(multisig.address, [
  "function threshold() view returns (uint256)",
  "function ownersCount() view returns (uint256)",
  "function isOwner(address) view returns (bool)",
], provider)
const checks = [
  ["the guard is owned by the multisig", (await g.owner()).toLowerCase() === multisig.address.toLowerCase()],
  ["moving the guard needs more than one key", (await ms.threshold()) >= 2n && (await ms.threshold()) <= (await ms.ownersCount())],
  ["the cold recovery sink is neither the owner nor the operator", (await g.recovery()).toLowerCase() !== multisig.address.toLowerCase() && (await g.recovery()).toLowerCase() !== (await g.operator()).toLowerCase()],
  ["the spend role and the pause role are held by different keys", (await g.operator()).toLowerCase() !== (await g.guardian()).toLowerCase()],
  ["the agent hot key holds no governance signature", (await ms.isOwner(operator)) === false],
  ["no owner action can take effect immediately", (await g.timelockDelay()) > 0n],
]
for (const [name, holds] of checks) console.log(`${holds ? "OK  " : "FAIL"} ${name}`)
const failed = checks.filter(([, holds]) => !holds)

result.multisig = { status: "deployed", address: multisig.address, threshold: Number(THRESHOLD), owners, note: "Owns CronusAgentGuardV2. Owners and threshold change only through a confirmed transaction to the multisig itself." }
result.governanceMigration.finishedAt = new Date().toISOString()
result.governanceMigration.invariants = checks.map(([name, holds]) => ({ name, holds }))
save()
console.log(`DONE: ${OUT}`)
if (failed.length) fail(`${failed.length} post-deployment invariant(s) failed; do not publish these addresses`)
