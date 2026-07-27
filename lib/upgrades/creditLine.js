// ShadowFloat Credit Line integration for Cronus
// EIP-712 SpendIntent with credit line tracking
// Source: github.com/dolepee/shadow (3rd place Agora)

import { keccak256, toHex, encodePacked } from 'viem';

const FLOAT_SCHEMA = {
  name: 'CronusFloatSpendIntent',
  fields: [
    { name: 'agentId', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
    { name: 'maxDebt', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'executor', type: 'address' }
  ]
};

export function createSpendIntent(agentId, amount, maxDebt, nonce, expiry, executor) {
  const domain = {
    name: 'CronusFloat',
    version: '1',
    chainId: 5042002,
    verifyingContract: process.env.FLOAT_REGISTRY || '0x0000000000000000000000000000000000000000'
  };

  const message = { agentId, amount, maxDebt, nonce, expiry, executor };
  
  return { domain, types: { CronusFloatSpendIntent: FLOAT_SCHEMA.fields }, message };
}

export function calculateCreditLine(purchaseHistory, reputationScore) {
  const baseLine = 0.1;
  const historyMultiplier = Math.min(purchaseHistory.length * 0.01, 0.5);
  const reputationMultiplier = (reputationScore || 0) / 100;
  
  return {
    maxCredit: baseLine + historyMultiplier + reputationMultiplier,
    interestRate: 0.001,
    gracePeriod: 86400
  };
}

export async function checkCreditUtilization(agentId, kv) {
  const key = `cronus:credit:${agentId}`;
  const used = await kv?.get?.(key) || 0;
  const limit = await kv?.get?.(`${key}:limit`) || 0;
  
  return {
    used: Number(used),
    limit: Number(limit),
    available: Math.max(0, Number(limit) - Number(used)),
    utilization: limit > 0 ? Number(used) / Number(limit) : 0
  };
}

export default async function handler(req, res) {
  const { action, agentId } = req.query || {};
  
  switch(action) {
    case 'line':
      const line = calculateCreditLine([], 85);
      return res.json({ kind: 'credit-line', agentId, ...line });
      
    case 'intent':
      const intent = createSpendIntent(1, 100000, 500000, Date.now(), Date.now() + 3600, '0x...');
      return res.json({ kind: 'spend-intent', intent });
      
    default:
      return res.json({ 
        kind: 'shadow-float',
        features: ['EIP-712 SpendIntent', 'Permissionless credit lines', 'KV tracked'],
        note: 'ShadowFloat primitive (Shadow inspired)'
      });
  }
}
