// Kelly Criterion for Optimal Stake Sizing
// Source: github.com/enliven17/mimir (1st place Agora)

export function kellyStake(confidence, trackRecord, bankroll, fraction = 0.25) {
  // f* = (bp - q) / b
  const p = confidence;
  const q = 1 - p;
  const b = calculateOdds(trackRecord);
  
  const kellyFraction = (b * p - q) / b;
  const safeFraction = kellyFraction * fraction; // Conservative half-Kelly
  
  return {
    optimalFraction: Math.max(0, safeFraction),
    stakeAmount: bankroll * Math.max(0, safeFraction),
    fullKelly: kellyFraction,
    safeKelly: safeFraction,
    edge: b * p - q,
    odds: b
  };
}

function calculateOdds(trackRecord) {
  if (!trackRecord || trackRecord.graded === 0) return 1;
  const winRate = trackRecord.hits / trackRecord.graded;
  return winRate > 0 ? (1 - winRate) / winRate : 1;
}

export function calculateConvictionStake(verdict, confidence, trackRecord, maxStake = 0.1) {
  if (verdict === 'SKIP' || confidence < 0.65) {
    return { stake: 0, reason: 'Below conviction threshold' };
  }
  
  const kelly = kellyStake(confidence, trackRecord, maxStake);
  const cappedStake = Math.min(kelly.stakeAmount, maxStake * 0.1);
  
  return {
    stake: cappedStake,
    kellyData: kelly,
    conviction: confidence,
    expectedValue: kelly.edge * cappedStake,
    capped: cappedStake < kelly.stakeAmount
  };
}

export default async function handler(req, res) {
  const { confidence, bankroll, verdict, hits, graded } = req.query || {};
  
  const trackRecord = { 
    hits: Number(hits) || 6, 
    graded: Number(graded) || 10 
  };
  
  const result = calculateConvictionStake(
    verdict || 'BUY',
    Number(confidence) || 0.7,
    trackRecord,
    Number(bankroll) || 1.0
  );
  
  return res.json({
    kind: 'kelly-stake',
    ...result,
    note: 'Optimal stake sizing via Kelly Criterion (Mimir inspired)',
    formula: 'f* = (bp - q) / b, safe = 0.25 * f*'
  });
}
