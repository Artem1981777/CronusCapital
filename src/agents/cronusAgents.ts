// CronusCapital — Three Agent System
// Scout → Analyst → Executor

const API_URL = '/api/claude';
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
      model: 'claude-sonnet-4-20250514',
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

// Agent 1: Scout — finds market signals
export async function runScout(topic: string): Promise<MarketSignal[]> {
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
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return [];
  }
}

// Agent 3: Executor — makes final decisions
export async function runExecutor(opportunities: BetOpportunity[]): Promise<string[]> {
  const system = `You are Executor, the decision-making agent for CronusCapital.
  Make final autonomous trading decisions. Be concise and decisive.
  Respond with a JSON array of decision strings only.`;
  
  const prompt = `Make final decisions on these opportunities:
  ${JSON.stringify(opportunities)}
  Consider risk management. Return JSON array of 2-3 decision strings.`;
  
  try {
    const text = await callClaude(prompt, system);
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return ['No opportunities identified'];
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
