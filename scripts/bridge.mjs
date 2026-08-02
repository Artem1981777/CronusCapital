// scripts/bridge.mjs — Cronus USDC bridge via Circle Bridge Kit (CCTP V2, burn-and-mint).
// v2 — hardened: amount validation, a fat-finger cap, a mandatory fee ceiling on
// mainnet routes, and an explicit confirmation before moving real USDC.
// Standalone and local-only: NOT wired into api/ (keeps the 12-handler Hobby cap free) and
// never runs on a server. The signing key is read from env at run time only.
// Testnet by default; mainnet is a deliberate opt-in (BRIDGE_ALLOW_MAINNET=1) so a fat-finger
// can never move real USDC once Arc mainnet ships. Chain names are strings; going mainnet is
// just Base_Sepolia->Base and Arc_Testnet->Arc - the SDK resolves CCTP addresses per chain.
import { BridgeKit } from "@circle-fin/bridge-kit"
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2"
import readline from "node:readline"

const PK = process.env.BRIDGE_PRIVATE_KEY
const FROM = process.env.BRIDGE_FROM_CHAIN || "Base_Sepolia"
const TO = process.env.BRIDGE_TO_CHAIN || "Arc_Testnet"
const AMOUNT = process.env.BRIDGE_AMOUNT || "1"
const SPEED = (process.env.BRIDGE_SPEED || "FAST").toUpperCase()
const ALLOW_MAINNET = process.env.BRIDGE_ALLOW_MAINNET === "1"

const isTestnet = (c) => /sepolia|testnet|devnet|fuji/i.test(String(c))
const bigintSafe = (_k, v) => (typeof v === "bigint" ? v.toString() : v)

// USDC has 6 decimals; accept only a plain positive decimal in that range. This
// also blocks NaN, negatives, scientific notation and stray text.
function parseAmount(raw) {
  const s = String(raw).trim()
  if (!/^\d+(\.\d{1,6})?$/.test(s)) {
    throw new Error("BRIDGE_AMOUNT must be a positive number with up to 6 decimals (got \"" + raw + "\")")
  }
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("BRIDGE_AMOUNT must be greater than zero (got \"" + raw + "\")")
  }
  return { s, n }
}

function parseCap(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("BRIDGE_MAX_AMOUNT must be a positive number (got \"" + raw + "\")")
  }
  return n
}

function confirm(question) {
  if (process.env.BRIDGE_YES === "1") return Promise.resolve(true)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(/^y(es)?$/i.test(String(answer).trim()))
    })
  })
}

async function main() {
  if (!PK) throw new Error("set BRIDGE_PRIVATE_KEY (use a TESTNET key only)")
  if (SPEED !== "FAST" && SPEED !== "SLOW") {
    throw new Error("BRIDGE_SPEED must be FAST or SLOW (got " + SPEED + ")")
  }

  const amount = parseAmount(AMOUNT)

  // Fat-finger cap. Defaults to 10 USDC; raise it deliberately via env for a
  // genuinely large transfer.
  const MAX_AMOUNT = parseCap(process.env.BRIDGE_MAX_AMOUNT || "10")
  if (amount.n > MAX_AMOUNT) {
    throw new Error(
      "BRIDGE_AMOUNT " + amount.s + " exceeds BRIDGE_MAX_AMOUNT " + MAX_AMOUNT + ". " +
      "Raise BRIDGE_MAX_AMOUNT only if you truly mean to move this much."
    )
  }

  const mainnetRoute = !isTestnet(FROM) || !isTestnet(TO)
  if (mainnetRoute && !ALLOW_MAINNET) {
    throw new Error(
      "refusing a non-testnet route (" + FROM + " -> " + TO + "): this moves REAL USDC. " +
      "Re-run with BRIDGE_ALLOW_MAINNET=1 only if you truly mean it."
    )
  }

  // On mainnet a missing fee ceiling means the SDK could accept any relayer fee.
  // Require an explicit cap so a bad quote cannot silently eat the transfer.
  if (mainnetRoute && !process.env.BRIDGE_MAX_FEE) {
    throw new Error(
      "mainnet route requires BRIDGE_MAX_FEE (max relayer fee, atomic USDC units). " +
      "Set it so a bad fee quote cannot drain the transfer."
    )
  }

  const kit = new BridgeKit()
  const adapter = createViemAdapterFromPrivateKey({ privateKey: PK })
  const config = { transferSpeed: SPEED }
  if (process.env.BRIDGE_MAX_FEE) config.maxFee = process.env.BRIDGE_MAX_FEE

  console.log(
    "bridging " + amount.s + " USDC: " + FROM + " -> " + TO + " (" + SPEED + ")" +
    (config.maxFee ? " maxFee=" + config.maxFee : "") +
    (mainnetRoute ? " [MAINNET - REAL FUNDS]" : " [testnet]")
  )

  // Last gate before real money moves.
  if (mainnetRoute) {
    const ok = await confirm("Move REAL USDC now? type 'yes' to proceed: ")
    if (!ok) {
      console.log("aborted by user; nothing was sent.")
      process.exit(0)
    }
  }

  return kit.bridge({
    from: { adapter, chain: FROM },
    to: { adapter, chain: TO },
    amount: amount.s,
    config,
  })
}
main()
  .then((result) => {
    console.log("done. steps:")
    console.log(JSON.stringify((result && result.steps) || result, bigintSafe, 2))
  })
  .catch((e) => {
    console.error("bridge failed: " + ((e && e.message) || e))
    process.exit(1)
  })
