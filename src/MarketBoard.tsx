import { useState, useEffect, type CSSProperties } from "react"

const GREEN = "#39e014", GOLD = "#c9a84c", DIM = "#7e8c6a", BG = "#070b07"
const RPC = "/api/rpc"
const ARC_CHAIN_ID = 5042002
const EXPLORER = "https://testnet.arcscan.app"

type Block = { number: number; timestamp: number; txs: number; gasUsed: number; gasLimit: number; baseFee: number; hash: string }
type Stat = {
  block: number; gasGwei: string; chainId: number
  txs: number; gasUsedPct: number; baseFeeGwei: string; avgIntervalSec: string; recent: Block[]
}

async function call(method: string, params: unknown[] = []) {
  const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })
  if (!r.ok) throw new Error("status " + r.status)
  const j = await r.json()
  if (j.error) throw new Error(j.error.message || "rpc error")
  return j.result
}
function hx(v: string | undefined): number { return v ? parseInt(v, 16) : 0 }
function parseBlock(b: any): Block {
  return { number: hx(b.number), timestamp: hx(b.timestamp), txs: Array.isArray(b.transactions) ? b.transactions.length : 0, gasUsed: hx(b.gasUsed), gasLimit: hx(b.gasLimit), baseFee: hx(b.baseFeePerGas), hash: b.hash || "" }
}

export default function MarketBoard() {
  const [stat, setStat] = useState<Stat | null>(null)
  const [synced, setSynced] = useState("")
  const [alive, setAlive] = useState(false)

  useEffect(() => {
    let stop = false
    async function load() {
      try {
        const [num, gas, cid, latest] = await Promise.all([
          call("eth_blockNumber"), call("eth_gasPrice"), call("eth_chainId"), call("eth_getBlockByNumber", ["latest", false]),
        ])
        const lb = parseBlock(latest)
        const tip = hx(num)
        const reqs: Promise<any>[] = []
        for (let i = 1; i <= 4; i++) reqs.push(call("eth_getBlockByNumber", ["0x" + (tip - i).toString(16), false]).catch(() => null))
        const prev = (await Promise.all(reqs)).filter(Boolean).map(parseBlock)
        if (stop) return
        const recent = [lb, ...prev]
        let avg = "—"
        if (recent.length >= 2) {
          let sum = 0, cnt = 0
          for (let i = 0; i < recent.length - 1; i++) { const d = recent[i].timestamp - recent[i + 1].timestamp; if (d > 0) { sum += d; cnt++ } }
          if (cnt) avg = (sum / cnt).toFixed(1)
        }
        setStat({
          block: tip, gasGwei: (hx(gas) / 1e9).toFixed(4), chainId: cid ? hx(cid) : ARC_CHAIN_ID,
          txs: lb.txs, gasUsedPct: lb.gasLimit ? (lb.gasUsed / lb.gasLimit) * 100 : 0,
          baseFeeGwei: (lb.baseFee / 1e9).toFixed(4), avgIntervalSec: avg, recent,
        })
        setAlive(true); setSynced(new Date().toLocaleTimeString())
      } catch {
        if (stop) return
        setAlive(false); setSynced(new Date().toLocaleTimeString())
      }
    }
    load()
    const iv = setInterval(load, 4000)
    return () => { stop = true; clearInterval(iv) }
  }, [])

  const s = stat
  return (
    <div style={panel}>
      <div style={head}>
        <span style={title}>{"\u{13080}"} ARC NETWORK · LIVE ON-CHAIN</span>
        <span style={liveBadge(alive)}>{alive ? "● LIVE" : "◌ RECONNECTING"}</span>
      </div>

      <div style={grid}>
        <Cell k="LIVE BLOCK" v={s ? "#" + s.block.toLocaleString() : "…"} big />
        <Cell k="GAS PRICE" v={s ? s.gasGwei + " GWEI · USDC" : "…"} />
        <Cell k="CHAIN ID" v={String(s?.chainId ?? ARC_CHAIN_ID)} />
        <Cell k="FINALITY" v="≈ 780 ms" accent />
      </div>
      <div style={grid}>
        <Cell k="TXS IN BLOCK" v={s ? String(s.txs) : "…"} />
        <Cell k="GAS USED" v={s ? s.gasUsedPct.toFixed(1) + " %" : "…"} />
        <Cell k="BASE FEE" v={s ? s.baseFeeGwei + " GWEI" : "…"} />
        <Cell k="AVG BLOCK TIME" v={s ? s.avgIntervalSec + " s" : "…"} />
      </div>

      <div style={feedHead}>RECENT BLOCKS</div>
      <div style={feed}>
        {(s?.recent || []).map(b => (
          <div key={b.number} style={feedRow}>
            <span style={feedNum}>{"#" + b.number.toLocaleString()}</span>
            <span style={feedTx}>{b.txs + " txs"}</span>
            <span style={feedAge}>{Math.max(0, Math.floor(Date.now() / 1000 - b.timestamp)) + "s ago"}</span>
          </div>
        ))}
        {!s && <div style={feedRow}><span style={dim}>connecting to rpc.testnet.arc.network…</span></div>}
      </div>

      <div style={proof}>
        <span style={liveStyle(alive ? GREEN : DIM)}>{alive ? "● LIVE" : "◌ OFFLINE"}</span>
        <span style={dim}>{"Source: rpc.testnet.arc.network · synced " + (synced || "…")}</span>
        <a href={EXPLORER} target="_blank" rel="noreferrer" style={link}>Arc Explorer ↗</a>
        <a href="https://www.circle.com/pressroom/circle-launches-arc-public-testnet" target="_blank" rel="noreferrer" style={link}>Circle ↗</a>
      </div>
      <div style={get}>POST {"https://rpc.testnet.arc.network"} {"{ eth_blockNumber, eth_gasPrice, eth_chainId, eth_getBlockByNumber }"}</div>
      <div style={note}>
        Circle Arc — стейблкоин-нативный L1: USDC как газ, финальность ~780мс (консенсус Malachite). Нативный токен пока на пресейле ($222M, оценка $3B) и не торгуется на биржах — поэтому показываем живые on-chain метрики сети напрямую с RPC, а не выдуманную цену.
      </div>
    </div>
  )
}

function Cell({ k, v, big, accent }: { k: string; v: string; big?: boolean; accent?: boolean }) {
  return (<div style={cell}><div style={cellKey}>{k}</div><div style={cellVal(!!big, !!accent)}>{v}</div></div>)
}

const panel: CSSProperties = { marginTop: 14, border: "1px solid " + GREEN + "22", background: BG, padding: 16 }
const head: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }
const title: CSSProperties = { color: GOLD, fontSize: 12, letterSpacing: 3, fontFamily: "Cinzel, serif" }
function liveBadge(a: boolean): CSSProperties { return { fontSize: 10, fontWeight: 700, letterSpacing: 2, color: a ? GREEN : DIM, border: "1px solid " + (a ? GREEN : DIM) + "55", padding: "3px 8px" } }
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 10 }
const cell: CSSProperties = { border: "1px solid " + GREEN + "22", background: "#040804", padding: "12px 14px" }
const cellKey: CSSProperties = { color: DIM, fontSize: 9, letterSpacing: 2, marginBottom: 6, fontFamily: "Cinzel, serif" }
function cellVal(big: boolean, accent: boolean): CSSProperties { return { color: accent ? GOLD : GREEN, fontSize: big ? 22 : 16, fontWeight: 700, fontFamily: "monospace" } }
const feedHead: CSSProperties = { color: DIM, fontSize: 9, letterSpacing: 2, margin: "8px 0 6px", fontFamily: "Cinzel, serif" }
const feed: CSSProperties = { border: "1px solid " + GREEN + "1a", background: "#040804", padding: 6 }
const feedRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", borderBottom: "1px solid #15301518", fontFamily: "monospace", fontSize: 11 }
const feedNum: CSSProperties = { color: "#d4e8c5", fontWeight: 700 }
const feedTx: CSSProperties = { color: GREEN }
const feedAge: CSSProperties = { color: DIM }
const dim: CSSProperties = { color: DIM, fontSize: 10 }
const proof: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 12, fontSize: 10, letterSpacing: 1 }
function liveStyle(c: string): CSSProperties { return { color: c, fontWeight: 700, letterSpacing: 2 } }
const link: CSSProperties = { color: GREEN, textDecoration: "none", borderBottom: "1px solid " + GREEN + "55" }
const get: CSSProperties = { marginTop: 8, color: "#5f7a5f", fontSize: 10, fontFamily: "monospace", wordBreak: "break-all" }
const note: CSSProperties = { marginTop: 10, color: "#6a5f45", fontSize: 11, lineHeight: 1.6, borderLeft: "2px solid " + GOLD + "55", paddingLeft: 12, fontStyle: "italic" }
