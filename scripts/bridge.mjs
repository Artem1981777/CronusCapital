// scripts/bridge.mjs — Cronus USDC bridge via Circle Bridge Kit (CCTP V2, burn-and-mint).
// Standalone and local-only: NOT wired into api/ (keeps the 12-handler Hobby cap free) and
// never runs on a server. The signing key is read from env at run time only.
// Testnet by default; mainnet is a deliberate opt-in (BRIDGE_ALLOW_MAINNET=1) so a fat-finger
// can never move real USDC once Arc mainnet ships. Chain names are strings; going mainnet is
// just Base_Sepolia->Base and Arc_Testnet->Arc - the SDK resolves CCTP addresses per chain.
import { BridgeKit } from "@circle-fin/bridge-kit"
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2"

const PK = process.env.BRIDGE_PRIVATE_KEY
const FROM = process.env.BRIDGE_FROM_CHAIN || "Base_Sepolia"
const TO = process.env.BRIDGE_TO_CHAIN || "Arc_Testnet"
const AMOUNT = process.env.BRIDGE_AMOUNT || "1"
const SPEED = (process.env.BRIDGE_SPEED || "FAST").toUpperCase()
const ALLOW_MAINNET = process.env.BRIDGE_ALLOW_MAINNET === "1"

const isTestnet = (c) => /sepolia|testnet|devnet|fuji/i.test(String(c))
const bigintSafe = (_k, v) => (typeof v === "bigint" ? v.toString() : v)

async function main() {
  if (!PK) throw new Error("set BRIDGE_PRIVATE_KEY (use a TESTNET key only)")
  if (SPEED !== "FAST" && SPEED !== "SLOW") {
    throw new Error("BRIDGE_SPEED must be FAST or SLOW (got " + SPEED + ")")
  }
  if ((!isTestnet(FROM) || !isTestnet(TO)) && !ALLOW_MAINNET) {
    throw new Error(
      "refusing a non-testnet route (" + FROM + " -> " + TO + "): this moves REAL USDC. " +
      "Re-run with BRIDGE_ALLOW_MAINNET=1 only if you truly mean it."
    )
  }
  const kit = new BridgeKit()
  const adapter = createViemAdapterFromPrivateKey({ privateKey: PK })
  const config = { transferSpeed: SPEED }
  if (process.env.BRIDGE_MAX_FEE) config.maxFee = process.env.BRIDGE_MAX_FEE

  console.log("bridging " + AMOUNT + " USDC: " + FROM + " -> " + TO + " (" + SPEED + ")")
  return kit.bridge({
    from: { adapter, chain: FROM },
    to: { adapter, chain: TO },
    amount: AMOUNT,
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
