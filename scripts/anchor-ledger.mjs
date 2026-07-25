#!/usr/bin/env node
// scripts/anchor-ledger.mjs - anchors keccak256 of previous-day m2m-ledger files on-chain                      // (tx to self with the hash as calldata). Git history could in theory be rewritten;
// an on-chain anchor makes the public trade ledger tamper-evident.
import fs from "node:fs"
import path from "node:path"                                                                                    const PK = process.env.RHEA_PRIVATE_KEY
const ARC_RPC_URL = process.env.ARC_RPC || ("https:" + "//rpc.blockdaemon.testnet.arc.network")
const DIR = "m2m-ledger"
const ANCHORS = path.join(DIR, "anchors.json")
const MAX_PER_RUN = 3

async function main() {                                   if (!PK) { console.log("no RHEA_PRIVATE_KEY, skip anchoring"); return }                                         const today = new Date().toISOString().slice(0, 10)
  let anchors = []                                        try { anchors = JSON.parse(fs.readFileSync(ANCHORS, "utf8")) } catch (_) {}
  const done = new Set(anchors.map(a => a.file))
  const pending = fs.readdirSync(DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < today && !done.has(f))
    .sort().slice(0, MAX_PER_RUN)
  if (!pending.length) { console.log("nothing to anchor"); return }

  const { createWalletClient, createPublicClient, http, defineChain, keccak256 } = await import("viem")
  const { privateKeyToAccount } = await import("viem/accounts")
  const chain = defineChain({ id: 5042002, name: "arc-testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [ARC_RPC_URL] } } })
  const account = privateKeyToAccount(PK.startsWith("0x") ? PK : "0x" + PK)
  const wallet = createWalletClient({ account: account, chain: chain, transport: http(ARC_RPC_URL) })
  const pub = createPublicClient({ chain: chain, transport: http(ARC_RPC_URL) })

  for (const f of pending) {
    const hash = keccak256(fs.readFileSync(path.join(DIR, f)))
    const tx = await wallet.sendTransaction({ to: account.address, value: 0n, data: hash })
    const rcpt = await pub.waitForTransactionReceipt({ hash: tx })
    anchors.push({ file: f, keccak256: hash, tx: tx, block: Number(rcpt.blockNumber), anchoredAt: new Date().toISOString(), by: account.address })
    console.log("anchored " + f + " -> " + tx)
  }
  fs.writeFileSync(ANCHORS, JSON.stringify(anchors, null, 2))
  console.log("anchors updated: " + ANCHORS)
}
main().catch(e => { console.error("[anchor] FAILED:", e.message || e); process.exit(1) })
