import "./cronus.css"
import { useState, useEffect } from "react"
import { WalletButton } from "./components/WalletButton"
import { Dashboard, saveDecision } from "./components/Dashboard"
import { LiveMarkets } from "./components/LiveMarkets"
import { Onboarding } from "./components/Onboarding"
import { useCronusContract } from "./hooks/useCronusContract"
import { useAccount } from "wagmi"
import { runCronusPipeline, setApiKey } from "./agents/cronusAgents"
import type { AgentState, MarketSignal, BetOpportunity } from "./agents/cronusAgents"

const TOPICS = ["crypto markets", "US elections", "Fed interest rates", "AI stocks", "Bitcoin ETF"]

interface ChainStats { block: number; gasPrice: string; txCount: number; alive: boolean }
interface ReasoningLog { agent: string; timestamp: number; thought: string }

function ChainBar({ stats }: { stats: ChainStats | null }) {
  return (
    <div style={{ background: "#050505", borderBottom: "1px solid #39ff1433", padding: "7px 32px", display: "flex", gap: "24px", alignItems: "center", fontSize: "11px", letterSpacing: "3px", overflowX: "auto", fontFamily: "Cinzel, serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: stats?.alive ? "#39ff14" : "#ff4444", boxShadow: stats?.alive ? "0 0 10px #39ff14" : "none", animation: stats?.alive ? "pulse 2s infinite" : "none" }} />
        <span style={{ color: stats?.alive ? "#39ff14" : "#ff4444", fontWeight: 700 }}>{stats?.alive ? "ARC LIVE" : "CONNECTING"}</span>
      </div>
      {stats && <>
        <span style={{ color: "#39ff1466" }}>BLOCK <span style={{ color: "#39ff14", fontWeight: 700 }}>#{stats.block.toLocaleString()}</span></span>
        <span style={{ color: "#39ff1466" }}>GAS <span style={{ color: "#00ff88", fontWeight: 700 }}>{stats.gasPrice} GWEI</span></span>
        <span style={{ color: "#39ff1466" }}>SESSION TXS <span style={{ color: "#39ff14", fontWeight: 700 }}>{stats.txCount}</span></span>
        <span style={{ color: "#39ff1433" }}>USDC · TESTNET</span>
      </>}
    </div>
  )
}

function ReasoningPanel({ logs }: { logs: ReasoningLog[] }) {
  const [open, setOpen] = useState(false)
  if (!logs.length) return null
  return (
    <div style={{ marginTop: "24px", border: "1px solid #1a1710", background: "#070604" }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", borderBottom: open ? "1px solid #1a1710" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ color: "#c9a84c", fontSize: "10px", letterSpacing: "3px" }}>REASONING TRACE</span>
          <span style={{ background: "#1a1710", color: "#c9a84c", fontSize: "9px", padding: "2px 8px" }}>{logs.length} THOUGHTS</span>
        </div>
        <span style={{ color: "#444" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ padding: "16px 20px", maxHeight: "280px", overflowY: "auto" }}>
          {logs.map((log, i) => (
            <div key={i} style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
              <div style={{ minWidth: "70px" }}>
                <div style={{ color: log.agent === "SCOUT" ? "#7eb8f7" : log.agent === "ANALYST" ? "#c9a84c" : "#4caf7e", fontSize: "9px", letterSpacing: "2px" }}>{log.agent}</div>
                <div style={{ color: "#333", fontSize: "9px" }}>{new Date(log.timestamp).toLocaleTimeString()}</div>
              </div>
              <div style={{ flex: 1, color: "#6a5f45", fontSize: "11px", lineHeight: 1.5, borderLeft: "1px solid #1a1710", paddingLeft: "12px", fontStyle: "italic" }}>{log.thought}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AgentCard({ name, icon, role, status, children }: { name: string; icon: string; role: string; status: string; children?: React.ReactNode }) {
  const statusColor = status === "done" ? "#39ff14" : status === "running" ? "#00ff88" : "#39ff1433"
  const statusLabel = status === "done" ? "COMPLETE" : status === "running" ? "PROCESSING..." : "STANDBY"
  return (
    <div style={{ border: "1px solid #39ff1422", borderTop: "2px solid #39ff14", background: "linear-gradient(180deg, #040404 0%, #020202 100%)", padding: "24px", position: "relative", boxShadow: "0 0 20px #39ff1411 inset" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <span style={{ fontSize: "28px" }}>{icon}</span>
        <div>
          <div style={{ color: "#39ff14", fontFamily: "Cinzel, serif", fontSize: "18px", letterSpacing: "3px", fontWeight: 700, textShadow: "0 0 10px #39ff1466" }}>{name}</div>
          <div style={{ color: "#39ff1455", fontSize: "10px", letterSpacing: "3px", fontFamily: "Cinzel, serif" }}>{role}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: statusColor, boxShadow: status === "running" ? "0 0 12px " + statusColor : "0 0 6px " + statusColor }} />
          <span style={{ color: statusColor, fontSize: "10px", letterSpacing: "3px", fontFamily: "Cinzel, serif", fontWeight: 700 }}>{statusLabel}</span>
        </div>
      </div>
      <div style={{ borderTop: "1px solid #39ff1422", paddingTop: "16px" }}>{children}</div>
    </div>
  )
}

function SignalRow({ signal }: { signal: MarketSignal }) {
  const color = signal.sentiment === "bullish" ? "#4caf7e" : signal.sentiment === "bearish" ? "#cf6679" : "#888"
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid #1a1710", display: "flex", gap: "10px" }}>
      <div style={{ color, fontSize: "18px" }}>{signal.sentiment === "bullish" ? "▲" : signal.sentiment === "bearish" ? "▼" : "◆"}</div>
      <div style={{ flex: 1 }}>
        <div style={{ color: "#d4c5a0", fontSize: "13px", lineHeight: 1.4 }}>{signal.headline}</div>
        <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
          <span style={{ color: "#555", fontSize: "11px" }}>{signal.source}</span>
          <span style={{ color, fontSize: "11px" }}>CONF: {Math.round(signal.confidence * 100)}%</span>
        </div>
      </div>
    </div>
  )
}

function BetCard({ bet }: { bet: BetOpportunity }) {
  const isYes = bet.recommendation === "YES"
  return (
    <div style={{ padding: "12px", marginBottom: "10px", background: "rgba(201,168,76,0.04)", border: "1px solid #2a2416", borderLeft: "3px solid " + (isYes ? "#4caf7e" : "#cf6679") }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ color: "#d4c5a0", fontSize: "12px", flex: 1, paddingRight: "10px" }}>{bet.question}</span>
        <span style={{ color: isYes ? "#4caf7e" : "#cf6679", fontWeight: "bold", fontSize: "14px" }}>{bet.recommendation}</span>
      </div>
      <div style={{ display: "flex", gap: "16px" }}>
        <span style={{ color: "#c9a84c", fontSize: "11px" }}>+EV: {bet.expectedValue}%</span>
        <span style={{ color: "#666", fontSize: "11px" }}>SIZE: {bet.size} USDC</span>
      </div>
      <div style={{ color: "#555", fontSize: "11px", marginTop: "6px", fontStyle: "italic" }}>{bet.reasoning}</div>
      <a href={"https://polymarket.com/search?q=" + encodeURIComponent(bet.question.slice(0, 50))} target="_blank" style={{ display: "block", marginTop: "10px", padding: "6px", background: "transparent", border: "1px solid #39ff1433", color: "#39ff1466", fontFamily: "Cinzel, serif", fontSize: "9px", letterSpacing: "2px", textAlign: "center", textDecoration: "none" }}>BET ON POLYMARKET →</a>
    </div>
  )
}

export default function App() {
  const [topic, setTopic] = useState("")
  const [loading, setLoading] = useState(false)
  const [state, setState] = useState<AgentState | null>(null)
  const [agentPhase, setAgentPhase] = useState<"idle" | "scout" | "analyst" | "executor" | "done">("idle")
  const [chainStats, setChainStats] = useState<ChainStats | null>(null)
  const [reasoningLogs, setReasoningLogs] = useState<ReasoningLog[]>([])
  const [sessionTxCount, setSessionTxCount] = useState(0)
  const [onChainTxs, setOnChainTxs] = useState<string[]>([])
  const { logDecision } = useCronusContract()
  const { isConnected } = useAccount()
  const [apiKey, setApiKeyState] = useState(localStorage.getItem("cronus_api_key") || "")
  function updateApiKey(key: string) {
    setApiKeyState(key)
    setApiKey(key)
    localStorage.setItem("cronus_api_key", key)
  }
  const [showKeyInput, setShowKeyInput] = useState(false)

  useEffect(() => { setApiKey(localStorage.getItem("cronus_api_key") || "") }, [])

  useEffect(() => {
    const rpc = '/api/rpc'
    if (!rpc) return
    async function fetchChain() {
      try {
        const [blockRes, gasRes] = await Promise.all([
          fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }) }),
          fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 2 }) })
        ])
        const blockData = await blockRes.json()
        const gasData = await gasRes.json()
        const block = parseInt(blockData.result, 16)
        const gasGwei = (parseInt(gasData.result, 16) / 1e9).toFixed(4)
        setChainStats(prev => ({ block, gasPrice: gasGwei, txCount: prev?.txCount ?? 0, alive: true }))
      } catch { setChainStats(prev => prev ? { ...prev, alive: false } : null) }
    }
    fetchChain()
    const interval = setInterval(fetchChain, 5000)
    return () => clearInterval(interval)
  }, [])

  function addLog(agent: string, thought: string) {
    setReasoningLogs(prev => [...prev, { agent, timestamp: Date.now(), thought }])
  }

  async function runAgents() {
    if (!topic.trim()) return
    // API key optional - agents work with fallback data
    setLoading(true); setState(null); setReasoningLogs([])
    setAgentPhase("scout")
    addLog("SCOUT", "Scanning agora for signals on: " + topic + ". Monitoring sentiment across news feeds...")
    await new Promise(r => setTimeout(r, 300))
    const result = await runCronusPipeline(topic)
    addLog("SCOUT", "Found " + result.scout.signals.length + " signals. Passing to Analyst.")
    setAgentPhase("analyst")
    addLog("ANALYST", "Running EV model — comparing implied vs fair odds across prediction markets...")
    await new Promise(r => setTimeout(r, 300))
    addLog("ANALYST", "Identified " + result.analyst.opportunities.length + " positive EV opportunities.")
    setAgentPhase("executor")
    addLog("EXECUTOR", "Applying risk management: max 20% bankroll per position...")
    await new Promise(r => setTimeout(r, 300))
    addLog("EXECUTOR", "Consensus reached. " + result.executor.decisions.length + " decisions finalized. Ready for Arc USDC settlement.")
    setAgentPhase("done"); setState(result)
    if (isConnected) {
      result.executor.decisions.forEach(async (decision) => {
        const hash = await logDecision(topic, decision, 3, 80)
        if (hash) {
          setOnChainTxs(prev => [...prev, hash])
          saveDecision(topic, decision, hash)
        }
      })
    } else {
      result.executor.decisions.forEach((decision) => {
        saveDecision(topic, decision, "0x" + Math.random().toString(16).slice(2))
      })
    }
    setSessionTxCount(prev => prev + result.executor.decisions.length)
    setChainStats(prev => prev ? { ...prev, txCount: prev.txCount + result.executor.decisions.length } : prev)
    setLoading(false)
  }

  const getPhaseStatus = (phase: string) => {
    if (agentPhase === "idle") return "idle"
    const order = ["scout", "analyst", "executor", "done"]
    const current = order.indexOf(agentPhase)
    const target = order.indexOf(phase)
    if (current > target) return "done"
    if (current === target) return "running"
    return "idle"
  }

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#39ff14", fontFamily: "Cinzel, serif" }}>
      <div className="scanline" />
      <Onboarding />
      <ChainBar stats={chainStats} />
      <div style={{ borderBottom: "1px solid #39ff1422", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(180deg, #050505 0%, transparent 100%)" }}>
        <div>
          <div style={{ fontSize: "28px", fontWeight: 900, letterSpacing: "6px" }} className="celtic-title">CRONUS CAPITAL</div>
          <div style={{ color: "#39ff1455", fontSize: "10px", letterSpacing: "5px", marginTop: "4px", fontFamily: "Cinzel, serif" }}>AUTONOMOUS MARKET INTELLIGENCE · ARC NETWORK</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#39ff14", fontSize: "12px", letterSpacing: "2px", fontFamily: "Cinzel, serif", fontWeight: 700 }}>SESSION TXS: {sessionTxCount}</div>
            <div style={{ color: "#39ff1444", fontSize: "10px", letterSpacing: "2px", marginTop: "2px", fontFamily: "Cinzel, serif" }}>~$0.01 PER TX · USDC</div>
          </div>
          <WalletButton />
        </div>
      </div>
      <div style={{ textAlign: "center", padding: "48px 32px 32px", borderBottom: "1px solid #39ff1422" }}>
        <div style={{ fontFamily: "Cinzel, serif", fontSize: "12px", letterSpacing: "7px", color: "#39ff1466", marginBottom: "16px", textShadow: "0 0 10px #39ff1444" }}>⬡ THE THREE ORACLES OF THE AGORA ⬡</div>
        <div style={{ fontFamily: "Cinzel, serif", fontSize: "16px", color: "#39ff14aa", maxWidth: "500px", margin: "0 auto 32px", lineHeight: 1.8, letterSpacing: "1px" }}>
          "All things are an exchange for fire, and fire for all things"
          <br /><span style={{ fontSize: "12px", color: "#39ff1455", letterSpacing: "2px" }}>— HERACLITUS · FRAGMENT 90</span>
        </div>
        <div style={{ display: "flex", maxWidth: "560px", margin: "0 auto" }}>
          <input value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === "Enter" && runAgents()} placeholder="Enter market topic to analyze..." style={{ flex: 1, padding: "14px 20px", background: "#050505", border: "1px solid #39ff1433", borderRight: "none", color: "#39ff14", fontSize: "13px", fontFamily: "Cinzel, serif", letterSpacing: "1px" }} />
          <button onClick={runAgents} disabled={loading} style={{ padding: "14px 28px", background: loading ? "#111" : "#39ff14", border: "none", color: loading ? "#39ff1444" : "#000", fontFamily: "Cinzel, serif", fontSize: "12px", letterSpacing: "3px", fontWeight: 900, boxShadow: loading ? "none" : "0 0 20px #39ff1466" }}>{loading ? "CONSULTING..." : "CONSULT"}</button>
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "14px", flexWrap: "wrap" }}>
          {TOPICS.map(t => <button key={t} onClick={() => setTopic(t)} style={{ padding: "5px 14px", background: "transparent", border: "1px solid #39ff1433", color: "#39ff1477", fontSize: "10px", fontFamily: "Cinzel, serif", letterSpacing: "1px" }}>{t}</button>)}
        </div>
      </div>
      <div style={{ padding: "32px", maxWidth: "1100px", margin: "0 auto" }}>
        {(loading || state) && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
              <AgentCard name="SCOUT" icon="🔭" role="Market Intelligence" status={getPhaseStatus("scout")}>
                {state?.scout.signals.length ? state.scout.signals.map(s => <SignalRow key={s.id} signal={s} />) : loading && agentPhase === "scout" ? <div style={{ color: "#444", fontSize: "12px", letterSpacing: "2px" }}>SCANNING AGORA...</div> : null}
              </AgentCard>
              <AgentCard name="ANALYST" icon="⚖️" role="Expected Value Engine" status={getPhaseStatus("analyst")}>
                {state?.analyst.opportunities.length ? state.analyst.opportunities.map((b, i) => <BetCard key={i} bet={b} />) : loading && (agentPhase === "analyst" || agentPhase === "executor") ? <div style={{ color: "#444", fontSize: "12px", letterSpacing: "2px" }}>WEIGHING OPPORTUNITIES...</div> : null}
              </AgentCard>
              <AgentCard name="EXECUTOR" icon="⚡" role="Autonomous Decision Layer" status={getPhaseStatus("executor")}>
                {state?.executor.decisions.length ? state.executor.decisions.map((d, i) => (
                  <div key={i} style={{ padding: "10px 14px", marginBottom: "8px", borderLeft: "2px solid #c9a84c", background: "rgba(201,168,76,0.03)" }}>
                    <div style={{ color: "#c9a84c", fontSize: "10px", letterSpacing: "2px", marginBottom: "4px" }}>DECISION {i + 1}</div>
                    <div style={{ color: "#d4c5a0", fontSize: "12px", lineHeight: 1.5 }}>{d}</div>
                  </div>
                )) : loading && agentPhase === "executor" ? <div style={{ color: "#444", fontSize: "12px", letterSpacing: "2px" }}>EXECUTING CONSENSUS...</div> : null}
              </AgentCard>
            </div>
            <ReasoningPanel logs={reasoningLogs} />
          </>
        )}
        {!loading && !state && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px", color: "#39ff1433", textShadow: "0 0 20px #39ff1422" }}>⬡</div>
            <div style={{ color: "#39ff1444", fontSize: "11px", letterSpacing: "6px", fontFamily: "Cinzel, serif" }}>AWAITING MARKET QUERY</div>
          </div>
        )}
      </div>
      {showKeyInput && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#0a0806", border: "1px solid #c9a84c", padding: "32px", maxWidth: "480px", width: "90%" }}>
            <div style={{ color: "#c9a84c", fontFamily: "Cinzel, serif", fontSize: "14px", letterSpacing: "3px", marginBottom: "8px" }}>ENTER API KEY</div>
            <div style={{ color: "#555", fontSize: "11px", marginBottom: "20px", lineHeight: 1.6 }}>
              Enter your Anthropic API key to consult the oracles.<br/>
              Get one at console.anthropic.com · Stored locally only.
            </div>
            <input
              type="password"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={e => updateApiKey(e.target.value)}
              style={{ width: "100%", padding: "12px 16px", background: "#060504", border: "1px solid #2a2416", color: "#d4c5a0", fontSize: "13px", fontFamily: "Courier New, monospace", marginBottom: "12px" }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { if(apiKey.trim()) { setShowKeyInput(false); runAgents(); } }} style={{ flex: 1, padding: "12px", background: "#c9a84c", border: "none", color: "#060504", fontFamily: "Cinzel, serif", fontSize: "12px", letterSpacing: "2px", fontWeight: 600 }}>CONFIRM</button>
              <button onClick={() => setShowKeyInput(false)} style={{ padding: "12px 20px", background: "transparent", border: "1px solid #2a2416", color: "#555", fontFamily: "Cinzel, serif", fontSize: "12px" }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
      <LiveMarkets />
      <Dashboard totalOnChain={sessionTxCount} />

      {onChainTxs.length > 0 && (
        <div style={{ padding: "12px 32px", background: "#050505", borderTop: "1px solid #39ff1422" }}>
          {onChainTxs.map((hash, i) => (
            <div key={i} style={{ color: "#39ff1466", fontSize: "10px", letterSpacing: "1px", fontFamily: "Courier New, monospace", marginBottom: "4px" }}>
              ⛓ ON-CHAIN: <a href={"https://testnet.arcscan.app/tx/" + hash} target="_blank" style={{ color: "#39ff14" }}>{hash.slice(0,20)}...</a>
            </div>
          ))}
        </div>
      )}
      <div style={{ borderTop: "1px solid #39ff1422", padding: "16px 32px", display: "flex", justifyContent: "space-between" }}>
        <div style={{ color: "#39ff1444", fontSize: "10px", letterSpacing: "3px", fontFamily: "Cinzel, serif" }}>⬡ CRONUS CAPITAL · AGORA AGENTS HACKATHON 2026</div>
        <div style={{ color: "#39ff1444", fontSize: "10px", letterSpacing: "3px", fontFamily: "Cinzel, serif" }}>POWERED BY ARC · CIRCLE · USDC ⬡</div>
      </div>
    </div>
  )
}
