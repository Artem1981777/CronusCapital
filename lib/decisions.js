import { createPublicClient, http, defineChain } from "viem"

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const CHAIN_ID = Number(process.env.ARC_CHAIN_ID || 5042002)
const ADDR = (process.env.CRONUS_DECISIONS_ADDRESS || "0xD9c8DC621e74c66c86D3c49434f1f038167E31B2")

const ABI = [
  { type: "function", name: "getDecisionsCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decisions", stateMutability: "view", inputs: [{ name: "i", type: "uint256" }], outputs: [
    { name: "oracle", type: "address" }, { name: "topic", type: "string" }, { name: "decision", type: "string" },
    { name: "agentId", type: "uint8" }, { name: "timestamp", type: "uint256" }, { name: "confidence", type: "uint256" }
  ] }
]

const arc = defineChain({ id: CHAIN_ID, name: "arc-testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })

export default async function decisions(req, res) {
  try {
    const q = req.query || {}
    const limit = Math.max(1, Math.min(100, Number(q.limit || 25)))
    const client = createPublicClient({ chain: arc, transport: http(RPC, { batch: true }) })
    const count = Number(await client.readContract({ address: ADDR, abi: ABI, functionName: "getDecisionsCount" }))
    const start = Math.max(0, count - limit)
    const idxs = []
    for (let i = count - 1; i >= start; i--) idxs.push(i)
    const rows = await Promise.all(idxs.map(async (i) => {
      const d = await client.readContract({ address: ADDR, abi: ABI, functionName: "decisions", args: [BigInt(i)] })
      const oracle = d.oracle || d[0]
      const topic = d.topic || d[1]
      const decision = String(d.decision || d[2] || "")
      const agentId = Number(d.agentId || d[3] || 0)
      const timestamp = Number(d.timestamp || d[4] || 0)
      const confidence = Number(d.confidence || d[5] || 0)
      const m = decision.match(/#([0-9a-fA-F]{6,})/)
      const role = agentId === 1 ? "Scout" : agentId === 2 ? "Analyst" : agentId === 3 ? "Executor" : "Unknown"
      return { index: i, oracle, topic, action: decision.split(" ")[0], decision, agentId, agentRole: role, confidence, timestamp, ts: timestamp ? new Date(timestamp * 1000).toISOString() : null, traceHashShort: m ? m[1] : null }
    }))
    res.status(200).json({ ok: true, network: "arc-testnet", contract: ADDR, explorer: "https://testnet.arcscan.app/address/" + ADDR, total_on_chain: count, returned: rows.length, decisions: rows, note: "On-chain decision log (CronusDecisions.logDecision). Oracle is the self-operated demo agent wallet (labeled). Each decision embeds a short sha256 trace hash re-verifiable at /api/trace.", updatedAt: new Date().toISOString() })
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) })
  }
}
