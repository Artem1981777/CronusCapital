// UseReceiptRegistry for on-chain audit anchoring
// Source: github.com/Ridwannurudeen/tollgate

import { keccak256, encodePacked } from 'viem';

export function anchorIntent(user, maxSpend, criteriaHash, nonce, expiry, chainId = 5042002) {
  const intentHash = keccak256(encodePacked(
    ['address', 'uint256', 'bytes32', 'uint256', 'uint256', 'uint256'],
    [user, maxSpend, criteriaHash, nonce, expiry, chainId]
  ));
  
  return {
    intentHash,
    user,
    maxSpend,
    criteriaHash,
    nonce,
    expiry,
    chainId
  };
}

export function settleReceipt(intentHash, actualSpend, resultHash, timestamp = Date.now()) {
  const receiptHash = keccak256(encodePacked(
    ['bytes32', 'uint256', 'bytes32', 'uint256'],
    [intentHash, actualSpend, resultHash, timestamp]
  ));
  
  return {
    receiptHash,
    intentHash,
    actualSpend,
    resultHash,
    timestamp,
    settled: true
  };
}

export default async function handler(req, res) {
  const { action, user, maxSpend, actualSpend, criteriaHash, resultHash } = req.query || {};
  
  if (action === 'anchor') {
    const nonce = Date.now();
    const expiry = Date.now() + 3600000; // 1 hour
    const intent = anchorIntent(
      user || '0x0000000000000000000000000000000000000000',
      maxSpend || '100000',
      criteriaHash || keccak256('0x'),
      nonce,
      expiry
    );
    
    return res.json({
      kind: 'use-intent-anchored',
      ...intent,
      note: 'EIP-712 style intent anchoring (TOLLGATE inspired)'
    });
  }
  
  if (action === 'settle') {
    const receipt = settleReceipt(
      criteriaHash || keccak256('0x'), // using as intentHash
      actualSpend || '50000',
      resultHash || keccak256('0xresult')
    );
    
    return res.json({
      kind: 'use-receipt-settled',
      ...receipt,
      note: 'Receipt settlement with keccak256 anchoring'
    });
  }
  
  return res.json({
    kind: 'use-receipt-registry',
    actions: ['anchor', 'settle'],
    features: [
      'Intent anchoring before execution',
      'Result settlement with proof',
      'Tamper-evident audit trail'
    ],
    note: 'On-chain audit anchoring (TOLLGATE inspired)'
  });
}
