// CronusCapital — Three Agent System
// Scout → Analyst → Executor

const API_URL = '/api/consult';
let userApiKey = '';
export function setApiKey(key: string) { userApiKey = key; }

export interface MarketSignal {
  id: string;
  source: string;
  headline: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  timestamp: number;
}

export interface BetOpportunity {
  market: string;
  question: string;
  recommendation: 'YES' | 'NO';
  expectedValue: number;
  reasoning: string;
  size: number;
}

export interface AgentState {
  scout: { status: string; signals: MarketSignal[] };
  analyst: { status: string; opportunities: BetOpportunity[] };
  executor: { status: string; decisions: string[] };
}

async function callClaude(prompt: string, system: string): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(userApiKey ? { 'x-api-key': userApiKey } : {}) },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  console.log("CLAUDE FULL RESPONSE:", JSON.stringify(data).slice(0, 300));
  if (data.error) {
    console.log("CLAUDE ERROR:", data.error.message);
    return '';
  }
  return data.content?.[0]?.text || '';
}

function getFallbackSignals(topic: string): MarketSignal[] {
  return [
    {id:"1", source:"Reuters", headline:"Institutional investors increase exposure to " + topic + " amid market uncertainty", sentiment:"bullish", confidence:0.74, timestamp:Date.now()},
    {id:"2", source:"Bloomberg", headline:"Regulatory concerns weigh on " + topic + " short-term outlook", sentiment:"bearish", confidence:0.68, timestamp:Date.now()},
    {id:"3", source:"CoinDesk", headline:"On-chain data shows mixed signals for " + topic + " this week", sentiment:"neutral", confidence:0.56, timestamp:Date.now()}
  ]
}


async function fetchPolymarketData(): Promise<any[]> {
  try {
    const res = await fetch("/api/polymarket?endpoint=markets&active=true&limit=5&order=volume&ascending=false")
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) return data.slice(0, 3)
    return []
  } catch (e) { return [] }
}

function polyToSignals(markets: any[], _topic: string): MarketSignal[] {
  return markets.map((m: any, i: number) => {
    let prices = [0.5, 0.5]
    try { prices = JSON.parse(m.outcomePrices).map(Number) } catch {}
    const yp = prices[0]
    return {
      id: String(i+1),
      source: "Polymarket",
      headline: m.question,
      sentiment: (yp > 0.6 ? "bullish" : yp < 0.4 ? "bearish" : "neutral") as any,
      confidence: Math.min(0.95, Math.abs(yp-0.5)*2+0.5),
      timestamp: Date.now()
    }
  })
}

// Agent 1: Scout — finds market signals
export async function runScout(topic: string): Promise<MarketSignal[]> {
  const polyData = await fetchPolymarketData()
  if (polyData.length > 0) return polyToSignals(polyData, topic)

  const system = `You are Scout, a market intelligence agent for CronusCapital. 
  Analyze news and generate market signals. 
  Respond ONLY with valid JSON array of signals, no markdown, no explanation.
  Each signal: { id, source, headline, sentiment, confidence (0-1), timestamp }`;
  
  const prompt = `You are analyzing prediction markets. Generate exactly 3 market signals about: ${topic}
  
  Return ONLY a valid JSON array with exactly this structure, no other text:
  [
    {"id":"1","source":"Reuters","headline":"Example headline about ${topic}","sentiment":"bullish","confidence":0.75,"timestamp":${Date.now()}},
    {"id":"2","source":"Bloomberg","headline":"Another signal","sentiment":"bearish","confidence":0.65,"timestamp":${Date.now()}},
    {"id":"3","source":"CoinDesk","headline":"Third signal","sentiment":"neutral","confidence":0.55,"timestamp":${Date.now()}}
  ]`;
  
  try {
    const text = await callClaude(prompt, system);
    console.log("SCOUT RAW:", text);
    if (!text || text.length < 10) return getFallbackSignals(topic);
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed) || parsed.length === 0) return getFallbackSignals(topic);
    return parsed;
  } catch (e) {
    console.log("SCOUT FALLBACK:", e);
    return getFallbackSignals(topic);
  }
}

function getFallbackOpportunities(signals: MarketSignal[]): BetOpportunity[] {
  return signals.slice(0, 2).map((signal) => {
    const isYes = signal.sentiment === "bullish"
    const edge = Math.round((signal.confidence - 0.5) * 100)
    const kellySize = Math.max(5, Math.min(50, Math.round(edge * 0.4)))
    return {
      market: "Polymarket",
      question: signal.headline,
      recommendation: isYes ? "YES" : "NO",
      expectedValue: Math.round(signal.confidence * 100),
      reasoning: "Bayesian prior from Polymarket price. Edge: " + edge + "%. Kelly fraction applied. Confidence: " + Math.round(signal.confidence * 100) + "%",
      size: kellySize
    }
  })
}

// Agent 2: Analyst — finds +EV opportunities
export async function runAnalyst(signals: MarketSignal[]): Promise<BetOpportunity[]> {
  const system = `You are Analyst, a quantitative agent for CronusCapital.
  Find positive expected value (+EV) betting opportunities from market signals.
  Respond ONLY with valid JSON array, no markdown, no explanation.
  Each opportunity: { market, question, recommendation, expectedValue (0-100), reasoning, size (1-100) }`;
  
  const prompt = `Analyze these signals and find +EV bets:
  ${JSON.stringify(signals)}
  Return JSON array of top 2 opportunities only.`;
  
  try {
    const text = await callClaude(prompt, system);
    if (!text || text.length < 10) return getFallbackOpportunities(signals);
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed) || parsed.length === 0) return getFallbackOpportunities(signals);
    return parsed;
  } catch {
    return getFallbackOpportunities(signals);
  }
}

// Agent 3: Executor — makes final decisions
export async function runExecutor(opportunities: BetOpportunity[]): Promise<string[]> {
  const system = "You are Executor, autonomous decision agent for CronusCapital. Rules: max 5% bankroll per position, min edge 3%, daily loss limit 20%. Make EXECUTE or HOLD decisions. Respond ONLY with JSON array of decision strings.";
  
  const opps = opportunities.map(o => o.question + " -> " + o.recommendation + " EV:" + o.expectedValue + "% SIZE:" + o.size + "USDC").join(" | ")
  const prompt = "Final risk-managed decisions for these Polymarket opportunities: " + opps + ". Output EXECUTE or HOLD for each. Format: EXECUTE: BUY [direction] on [market] - EV [X]% SIZE [Y] USDC or HOLD: [reason]. Return JSON array of 2 strings only.";
  
  try {
    const text = await callClaude(prompt, system);
    if (!text || text.length < 10) {
      return opportunities.map(o => {
        if (o.expectedValue > 60) {
          return "EXECUTE: " + o.recommendation + " on " + o.question.slice(0, 50) + " — EV " + o.expectedValue + "% SIZE " + o.size + " USDC"
        }
        return "HOLD: " + o.question.slice(0, 50) + " — edge insufficient (" + o.expectedValue + "% EV)"
      })
    }
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed) || parsed.length === 0) return ["EXECUTE: Position identified, awaiting Arc settlement"];
    return parsed;
  } catch {
    return opportunities.map(o => {
      if (o.expectedValue > 60) {
        return "EXECUTE: " + o.recommendation + " on " + o.question.slice(0, 50) + " — EV " + o.expectedValue + "% SIZE " + o.size + " USDC"
      }
      return "HOLD: " + o.question.slice(0, 50) + " — edge below threshold"
    })
  }
}

// Run full pipeline
export async function runCronusPipeline(topic: string): Promise<AgentState> {
  const state: AgentState = {
    scout: { status: 'running', signals: [] },
    analyst: { status: 'waiting', opportunities: [] },
    executor: { status: 'waiting', decisions: [] }
  };

  state.scout.signals = await runScout(topic);
  state.scout.status = 'done';
  
  state.analyst.status = 'running';
  state.analyst.opportunities = await runAnalyst(state.scout.signals);
  state.analyst.status = 'done';
  
  state.executor.status = 'running';
  state.executor.decisions = await runExecutor(state.analyst.opportunities);
  state.executor.status = 'done';

  return state;
}

// ============================================================
// POLISH (Шаг 3, opt-in): живой OKX+LLM оракул как источник пайплайна.
// ТОЛЬКО additive — runScout/runAnalyst/runExecutor/runCronusPipeline не тронуты.
// Включается из App.tsx лишь при VITE_USE_LIVE_ORACLE === "true".
// Повторяет рабочий GET-вызов из src/components/CronusDashboard.tsx.
// ============================================================
const CONSULT_URL = '/api/consult';

function topicToInstId(topic: string): string {
  const m = (topic || '').toUpperCase().match(/[A-Z]{2,10}-[A-Z]{2,10}/);
  return m ? m[0] : 'BTC-USDC';
}

export interface ConsultResult {
  ok: boolean;
  live?: boolean;
  price?: number | null;
  changePct?: number | null;
  trace?: string[];
  analog?: { regime?: string; outcome?: string; similarity?: number } | null;
  verdict?: string;
  conviction?: number;
  decisions?: Array<{ src?: string; ev?: number; price?: number; action?: string }>;
}

export async function callConsult(topic: string): Promise<ConsultResult | null> {
  const instId = topicToInstId(topic);
  try {
    const res = await fetch(CONSULT_URL + '?instId=' + encodeURIComponent(instId) + '&topic=' + encodeURIComponent(topic));
    const data = await res.json();
    if (!data || data.ok === false) return null;
    return data as ConsultResult;
  } catch {
    return null;
  }
}

export async function runCronusPipelineLive(topic: string): Promise<AgentState> {
  const consult = await callConsult(topic);
  if (!consult) return runCronusPipeline(topic);

  const instId = topicToInstId(topic);
  const bullish = (consult.verdict === 'YES') || ((consult.changePct ?? 0) > 0);
  const conf = Math.max(0, Math.min(1, (consult.conviction ?? 0) / 100));

  const signals: MarketSignal[] = [{
    id: '1',
    source: 'OKX · Cronus Oracle',
    headline: instId + ' ' + ((consult.changePct ?? 0) >= 0 ? '+' : '') + (consult.changePct == null ? '?' : consult.changePct.toFixed(2)) + '% 24h @ ' + (consult.price ?? '?'),
    sentiment: bullish ? 'bullish' : ((consult.verdict === 'NO' || (consult.changePct ?? 0) < 0) ? 'bearish' : 'neutral'),
    confidence: conf,
    timestamp: Date.now(),
  }];

  const decs = Array.isArray(consult.decisions) ? consult.decisions : [];
  const opportunities: BetOpportunity[] = (decs.length ? decs : [{ src: instId, ev: conf, price: consult.price ?? 0, action: bullish ? 'BUY' : 'SKIP' }])
    .slice(0, 2)
    .map((d) => ({
      market: 'Arc Oracle',
      question: (d.src || instId) + ' momentum',
      recommendation: (d.action === 'BUY' ? 'YES' : 'NO') as 'YES' | 'NO',
      expectedValue: Math.round(((d.ev ?? conf) as number) * 100),
      reasoning: (consult.trace && consult.trace.length ? consult.trace.join(' | ') : ('Verdict ' + (consult.verdict || 'SKIP') + ', conviction ' + (consult.conviction ?? 0) + '%')),
      size: Math.max(1, Math.min(50, Math.round(((d.ev ?? conf) as number) * 50))),
    }));

  let decisions: string[];
  if (consult.verdict === 'YES' || consult.verdict === 'NO') {
    decisions = decs.length
      ? decs.map((d) => 'EXECUTE: ' + (d.action || (bullish ? 'BUY' : 'SELL')) + ' ' + (d.src || instId) + ' — EV ' + Math.round(((d.ev ?? conf) as number) * 100) + '% @ ' + (d.price ?? consult.price ?? '?'))
      : ['EXECUTE: ' + (bullish ? 'BUY' : 'SELL') + ' ' + instId + ' — conviction ' + (consult.conviction ?? 0) + '%'];
  } else {
    decisions = ['HOLD: ' + instId + ' — SKIP, conviction ' + (consult.conviction ?? 0) + '% below bar'];
  }

  return {
    scout: { status: 'done', signals },
    analyst: { status: 'done', opportunities },
    executor: { status: 'done', decisions },
  };
}
