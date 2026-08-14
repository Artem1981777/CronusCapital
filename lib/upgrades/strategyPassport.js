// Strategy Passport - Decision Provenance Schema
// Source: github.com/a-apin/archimedes (Agora Standout)

export function createStrategyPassport(decision) {
  return {
    version: '1.0',
    schema: 'cronus-strategy-passport',
    timestamp: Date.now(),
    
    // Decision provenance
    decision: {
      id: generateId(),
      type: decision.type || 'signal',
      verdict: decision.verdict,
      confidence: decision.confidence,
      timestamp: decision.timestamp || Date.now()
    },
    
    // Input data sources
    inputs: {
      marketData: decision.marketData || {},
      oracleSources: decision.oracles || [],
      crossChecks: decision.crossChecks || []
    },
    
    // Reasoning chain
    reasoning: {
      trace: decision.trace || [],
      model: decision.model || 'openai/gpt-oss-120b',
      temperature: decision.temperature || 0,
      deterministic: decision.deterministic !== false
    },
    
    // Economic context
    economics: {
      cogs: decision.cogs || 0,
      revenue: decision.revenue || 0,
      expectedValue: decision.ev || 0,
      kellyStake: decision.kellyStake
    },
    
    // Risk metrics
    risk: {
      conviction: decision.conviction,
      brierScore: decision.brier,
      calibration: decision.calibration,
      maxDrawdown: decision.maxDrawdown
    },
    
    // Verification
    verification: {
      traceHash: decision.traceHash,
      commitment: decision.commitment,
      anchored: !!decision.traceHash
    }
  };
}

export function validatePassport(passport) {
  const required = ['version', 'decision', 'inputs', 'reasoning'];
  const missing = required.filter(k => !passport[k]);
  
  return {
    valid: missing.length === 0,
    missing,
    completeness: calculateCompleteness(passport),
    integrity: verifyIntegrity(passport)
  };
}

function generateId() {
  return `passport-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function calculateCompleteness(passport) {
  const sections = ['decision', 'inputs', 'reasoning', 'economics', 'risk', 'verification'];
  const present = sections.filter(s => passport[s] && Object.keys(passport[s]).length > 0);
  return present.length / sections.length;
}

function verifyIntegrity(passport) {
  // Simplified - in production would verify traceHash
  return passport.verification?.traceHash?.length === 66;
}

export default async function handler(req, res) {
  const { verdict, confidence, trace, model } = req.query || {};
  
  const mockDecision = {
    type: 'signal',
    verdict: verdict || 'BUY',
    confidence: Number(confidence) || 0.72,
    trace: trace ? trace.split(',') : ['SCOUT', 'ANALYZE', 'DECIDE'],
    model: model || 'openai/gpt-oss-120b',
    temperature: 0,
    deterministic: true,
    cogs: 0.005,
    revenue: 0.02,
    ev: 0.015
  };
  
  const passport = createStrategyPassport(mockDecision);
  const validation = validatePassport(passport);
  
  return res.json({
    kind: 'strategy-passport',
    passport,
    validation,
    note: 'Decision provenance schema (Archimedes inspired)',
    standard: 'Cronus Strategy Passport v1.0'
  });
}
