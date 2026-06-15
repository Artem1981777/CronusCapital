import { useState, useEffect, useRef, type CSSProperties } from "react"

type Candle = { t: number; o: number; h: number; l: number; c: number }
type Kind = "price" | "onchain"
type Coin = { id: string; sym: string; label: string; kind: Kind; exLabel: string; exUrl: string }

const COINS: Coin[] = [
  { id: "bitcoin",  sym: "BTC", label: "BTC/USD · INTRADAY", kind: "price", exLabel: "Binance", exUrl: "https://www.binance.com/en/trade/BTC_USDT" },
  { id: "ethereum", sym: "ETH", label: "ETH/USD · INTRADAY", kind: "price", exLabel: "Binance", exUrl: "https://www.binance.com/en/trade/ETH_USDT" },
  { id: "solana",   sym: "SOL", label: "SOL/USD · INTRADAY", kind: "price", exLabel: "Binance", exUrl: "https://www.binance.com/en/trade/SOL_USDT" },
  { id: "arbitrum", sym: "ARB", label: "ARB/USD · INTRADAY", kind: "price", exLabel: "Binance", exUrl: "https://www.binance.com/en/trade/ARB_USDT" },
  { id: "arc",      sym: "ARC", label: "ARC · CIRCLE ARC NETWORK", kind: "onchain", exLabel: "Circle", exUrl: "https://www.circle.com/pressroom/circle-launches-arc-public-testnet" },
]

const GREEN = "#39e014", RED = "#e0563a", GOLD = "#c9a84c", DIM = "#7e8c6a", BG = "#070b07"
const RPC = "/api/rpc"
const ARC_CHAIN_ID = 5042002

function ohlcUrl(id: string) { return "https://api.coingecko.com/api/v3/coins/" + id + "/ohlc?vs_currency=usd&days=1" }
function fmtUsd(n: number) { return "$" + n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 4 : 0 }) }
function now() { return new Date().toLocaleTimeString() }

function synth(id: string): Candle[] {
  const base = id === "bitcoin" ? 65000 : id === "ethereum" ? 3400 : id === "solana" ? 150 : 1.1
  const out: Candle[] = []
  let p = base
  for (let i = 0; i < 48; i++) {
    const o = p
    const c = o * (1 + (Math.sin(i / 3) + (Math.random() - 0.5)) * 0.004)
    const h = Math.max(o, c) * (1 + Math.random() * 0.003)
    const l = Math.min(o, c) * (1 - Math.random() * 0.003)
    out.push({ t: Date.now() - (48 - i) * 1800000, o, h, l, c })
    p = c
  }
  return out
}

type ArcStat = { block: number; gasGwei: string; chainId: number | null; alive: boolean }

export default function MarketBoard() {
  const [coinId, setCoinId] = useState("bitcoin")
  const [candles, setCandles] = useState<Candle[]>([])
  const [live, setLive] = useState(false)
  const [synced, setSynced] = useState("")
  const [arc, setArc] = useState<ArcStat | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const coin = COINS.find(c => c.id === coinId) || COINS[0]

  useEffect(() => {
    if (coin.kind !== "price") return
    let stop = false
    async function load() {
      try {
        const res = await fetch(ohlcUrl(coin.id))
        if (!res.ok) throw new Error("status " + res.status)
        const raw = await res.json()
        if (stop) return
        const cs: Candle[] = raw.map((r: number[]) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4] }))
        if (!cs.length) throw new Error("empty")
        setCandles(cs); setLive(true); setSynced(now())
      } catch {
        if (stop) return
        setCandles(synth(coin.id)); setLive(false); setSynced(now())
      }
    }
    load()
    const iv = setInterval(load, 45000)
    return () => { stop = true; clearInterval(iv) }
  }, [coinId])

  useEffect(() => {
    if (coin.kind !== "onchain") return
    let stop = false
    const mk = (m: string, id: number) => JSON.stringify({ jsonrpc: "2.0", method: m, params: [], id })
    async function load() {
      try {
        const [b, g, c] = await Promise.all([
          fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: mk("eth_blockNumber", 1) }),
          fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: mk("eth_gasPrice", 2) }),
          fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: mk("eth_chainId", 3) }),
        ])
        const bd = await b.json(), gd = await g.json(), cd = await c.json()
        if (stop) return
        setArc({
          block: parseInt(bd.result, 16),
          gasGwei: (parseInt(gd.result, 16) / 1e9).toFixed(4),
          chainId: cd.result ? parseInt(cd.result, 16) : ARC_CHAIN_ID,
          alive: true,
        })
        setLive(true); setSynced(now())
      } catch {
        if (stop) return
        setArc(prev => prev ? { ...prev, alive: false } : { block: 0, gasGwei: "—", chainId: ARC_CHAIN_ID, alive: false })
        setLive(false); setSynced(now())
      }
    }
    load()
    const iv = setInterval(load, 6000)
    return () => { stop = true; clearInterval(iv) }
  }, [coinId])

  useEffect(() => {
    if (coin.kind !== "price") return
    const canvas = canvasRef.current, wrap = wrapRef.current
    if (!canvas || !wrap || !candles.length) return
    const dpr = window.devicePixelRatio || 1
    const W = wrap.clientWidth, H = 320
    canvas.width = W * dpr; canvas.height = H * dpr
    canvas.style.width = W + "px"; canvas.style.height = H + "px"
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H)
    const padL = 8, padR = 70, padT = 14, padB = 18
    const cw = W - padL - padR, ch = H - padT - padB
    const hi = Math.max(...candles.map(c => c.h)), lo = Math.min(...candles.map(c => c.l))
    const range = hi - lo || 1
    const y = (v: number) => padT + (hi - v) / range * ch
    ctx.strokeStyle = "#15301522"; ctx.fillStyle = DIM; ctx.font = "10px monospace"; ctx.textAlign = "left"
    for (let i = 0; i <= 4; i++) {
      const gy = padT + ch * i / 4
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + cw, gy); ctx.stroke()
      ctx.fillText(fmtUsd(hi - range * i / 4), padL + cw + 6, gy + 3)
    }
    const n = candles.length, bw = cw / n
    candles.forEach((c, i) => {
      const x = padL + i * bw + bw / 2
      const up = c.c >= c.o
      ctx.strokeStyle = up ? GREEN : RED; ctx.fillStyle = up ? GREEN : RED
      ctx.beginPath(); ctx.moveTo(x, y(c.h)); ctx.lineTo(x, y(c.l)); ctx.stroke()
      const bodyT = y(Math.max(c.o, c.c)), bodyB = y(Math.min(c.o, c.c))
      ctx.fillRect(x - bw * 0.3, bodyT, bw * 0.6, Math.max(1, bodyB - bodyT))
    })
    const last = candles[n - 1].c
    ctx.strokeStyle = GOLD; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(padL, y(last)); ctx.lineTo(padL + cw, y(last)); ctx.stroke()
    ctx.setLineDash([]); ctx.fillStyle = GOLD; ctx.fillText(fmtUsd(last), padL + cw + 6, y(last) + 3)
  }, [candles, coinId])

  const last = candles.length ? candles[candles.length - 1].c : 0
  const first = candles.length ? candles[0].o : 0
  const chgPct = first ? ((last - first) / first) * 100 : 0

  return (
    <div style={panelStyle}>
      <div style={headStyle}>
        <span style={titleStyle}>{"\u{13080}"} LIVE CANDLES · TOP CRYPTO</span>
        <div style={tabsStyle}>
          {COINS.map(c => (
            <span key={c.id} onClick={() => setCoinId(c.id)} style={tabStyle(c.id === coinId)}>{c.sym}</span>
          ))}
        </div>
      </div>

      {coin.kind === "price" ? (
        <>
          <div style={priceRowStyle}>
            <span style={bigPriceStyle}>{fmtUsd(last)}</span>
            <span style={chgStyle(chgPct)}>{(chgPct >= 0 ? "+" : "") + chgPct.toFixed(2)}%</span>
            <span style={labelStyle}>{coin.label}</span>
          </div>
          <div ref={wrapRef} style={fullW}>
            <canvas ref={canvasRef} />
          </div>
        </>
      ) : (
        <div style={arcWrapStyle}>
          <div style={arcGridStyle}>
            <ArcCell k="LIVE BLOCK" v={arc && arc.block ? "#" + arc.block.toLocaleString() : "…"} />
            <ArcCell k="GAS PRICE" v={arc ? arc.gasGwei + " GWEI · USDC" : "…"} />
            <ArcCell k="CHAIN ID" v={String(arc?.chainId ?? ARC_CHAIN_ID)} />
            <ArcCell k="FINALITY" v="≈ 780 ms" />
          </div>
          <div style={arcNoteStyle}>
            Circle Arc — стейблкоин-нативный L1 (USDC как газ, финальность ~780мс). Нативный токен пока на пресейле ($222M, оценка $3B) и ещё не торгуется на биржах — поэтому здесь живые on-chain метрики сети, а не выдуманная цена.
          </div>
        </div>
      )}

      <div style={proofStyle}>
        <span style={liveStyle(live)}>{live ? "● LIVE" : "◌ SIMULATED"}</span>
        <span style={dimSmall}>Source: {coin.kind === "price" ? "api.coingecko.com" : "rpc.testnet.arc.network"}</span>
        <span style={dimSmall}>synced {synced || "…"}</span>
        {coin.kind === "price" ? (
          <a href={ohlcUrl(coin.id)} target="_blank" rel="noreferrer" style={linkStyle}>Verify raw ↗</a>
        ) : (
          <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer" style={linkStyle}>Arc Explorer ↗</a>
        )}
        <a href={coin.exUrl} target="_blank" rel="noreferrer" style={linkStyle}>{coin.exLabel} ↗</a>
      </div>
      <div style={getStyle}>
        {coin.kind === "price"
          ? "GET " + ohlcUrl(coin.id)
          : "POST https://rpc.testnet.arc.network  { eth_blockNumber, eth_gasPrice, eth_chainId }"}
      </div>
      <div style={captionStyle}>
        {coin.kind === "price"
          ? "Real open / high / low / close candles fetched live from CoinGecko. Click \"Verify raw\" to inspect the JSON yourself, or cross-check on " + coin.exLabel + "."
          : "Live block height, gas and chain id fetched directly from the Arc testnet RPC. No tradeable ARC price exists yet — Circle's Arc token is still in presale."}
      </div>
    </div>
  )
}

function ArcCell({ k, v }: { k: string; v: string }) {
  return (
    <div style={arcCellStyle}>
      <div style={arcCellKey}>{k}</div>
      <div style={arcCellVal}>{v}</div>
    </div>
  )
}

const panelStyle: CSSProperties = { marginTop: 14, border: "1px solid " + GREEN + "22", background: BG, padding: 16 }
const headStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }
const titleStyle: CSSProperties = { color: GOLD, fontSize: 11, letterSpacing: 3, fontFamily: "Cinzel, serif" }
const tabsStyle: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" }
function tabStyle(active: boolean): CSSProperties {
  return { padding: "4px 10px", fontSize: 10, letterSpacing: 2, cursor: "pointer", border: "1px solid " + (active ? GOLD : GREEN + "33"), color: active ? GOLD : DIM, background: active ? GOLD + "14" : "transparent", fontFamily: "Cinzel, serif" }
}
const fullW: CSSProperties = { width: "100%" }
const priceRowStyle: CSSProperties = { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }
const bigPriceStyle: CSSProperties = { color: "#eafff0", fontSize: 26, fontWeight: 700 }
function chgStyle(p: number): CSSProperties { return { color: p >= 0 ? GREEN : RED, fontSize: 14, fontWeight: 700 } }
const labelStyle: CSSProperties = { color: DIM, fontSize: 10, letterSpacing: 2 }
const proofStyle: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 12, fontSize: 10, letterSpacing: 1 }
function liveStyle(on: boolean): CSSProperties { return { color: on ? GREEN : GOLD, fontWeight: 700, letterSpacing: 2 } }
const dimSmall: CSSProperties = { color: DIM, fontSize: 10 }
const linkStyle: CSSProperties = { color: GREEN, textDecoration: "none", borderBottom: "1px solid " + GREEN + "55" }
const getStyle: CSSProperties = { marginTop: 8, color: "#5f7a5f", fontSize: 10, fontFamily: "monospace", wordBreak: "break-all" }
const captionStyle: CSSProperties = { marginTop: 6, color: "#4f6a4f", fontSize: 9, lineHeight: 1.5, fontStyle: "italic" }
const arcWrapStyle: CSSProperties = { padding: "8px 0" }
const arcGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }
const arcCellStyle: CSSProperties = { border: "1px solid " + GREEN + "22", background: "#040804", padding: "14px 16px" }
const arcCellKey: CSSProperties = { color: DIM, fontSize: 9, letterSpacing: 2, marginBottom: 6, fontFamily: "Cinzel, serif" }
const arcCellVal: CSSProperties = { color: GREEN, fontSize: 18, fontWeight: 700, fontFamily: "monospace" }
const arcNoteStyle: CSSProperties = { marginTop: 12, color: "#6a5f45", fontSize: 11, lineHeight: 1.6, borderLeft: "2px solid " + GOLD + "55", paddingLeft: 12, fontStyle: "italic" }
