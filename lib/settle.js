// lib/settle.js — server-side auto-settlement for Cronus MCP paid tools.
// HONEST LABEL: pays with Cronus's OWN test wallet to demonstrate the live x402
// paywall end-to-end (e.g. inside Claude). Self-generated volume, NOT external
// demand. /api/leaderboard keeps external_payers = 0 (client tagged self/demo).
// Only runs when CRONUS_AUTOSETTLE=1 and a wallet key is present.

const TX_RE = /^0x[0-9a-fA-F]{64}$/
const SELF_CLIENT = "cronus-mcp-autosettle (self/demo)"

export function autosettleEnabled() {
  return process.env.CRONUS_AUTOSETTLE === "1" && !!(process.env.CRONUS_WALLET_KEY || process.env.BUYER_PRIVATE_KEY)
}

export async function settlePaidTool(base, name, args) {
  const instId = (args && args.instId) || "ETH-USDC"
  const path = name === "cronus_signal" ? "/api/signal" : "/api/nano-signal"
  const PK = process.env.CRONUS_WALLET_KEY || process.env.BUYER_PRIVATE_KEY
  if (!PK) throw new Error("no wallet key in env")
  const CHAIN = process.env.CRONUS_SETTLE_CHAIN || "arcTestnet"
  const CAP = Number(process.env.CRONUS_MAX_SEND || "5")
  const url = base + path + "?instId=" + encodeURIComponent(instId) + "&topic=" + encodeURIComponent(instId + " signal") + "&client=" + encodeURIComponent(SELF_CLIENT)

  const { GatewayClient } = await import("@circle-fin/x402-batching/client")
  const gateway = new GatewayClient({
    chain: CHAIN,
    privateKey: PK.startsWith("0x") ? PK : "0x" + PK,
    ...(process.env.ARC_RPC ? { rpcUrl: process.env.ARC_RPC } : {}),
  })

  const result = await gateway.pay(url)
  const amt = Number(result.formattedAmount || 0)
  if (amt > CAP) throw new Error("settled amount " + amt + " exceeds cap " + CAP)

  const data = result.data || {}
  const rep = data.report || {}
  const tx = result.transaction || null
  const onchain = TX_RE.test(String(tx || ""))
  return {
    endpoint: path + "?instId=" + instId,
    httpStatus: 200,
    paymentRequired: false,
    autoSettled: true,
    settledBy: "cronus-test-wallet (self/demo)",
    external: false,
    honesty: "Paid by Cronus's own test wallet to prove the x402 paywall works end-to-end. Self-generated volume, NOT external demand; /api/leaderboard keeps external_payers=0.",
    amountUsdc: result.formattedAmount || null,
    settlement: tx,
    settlementType: onchain ? "onchain" : "gateway-batch",
    explorer: onchain ? "https://testnet.arcscan.app/tx/" + tx : null,
    verdict: rep.verdict || null,
    conviction: rep.conviction != null ? rep.conviction : null,
    result: data,
  }
}
