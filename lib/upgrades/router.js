// Upgrades Router - Consolidated handler for all upgrade modules
// Integrates with existing api/info.js via kind parameter

import creditLine from './creditLine.js';
import councilConsensus from './councilConsensus.js';
import thompsonSampling from './thompsonSampling.js';
import kellyStaking from './kellyStaking.js';
import useReceiptRegistry from './useReceiptRegistry.js';
import strategyPassport from './strategyPassport.js';

// Map of upgrade kinds to handlers
export const UPGRADE_ROUTES = {
  'shadow-float': creditLine,
  'council': councilConsensus,
  'council-consensus': councilConsensus,
  'thompson': thompsonSampling,
  'thompson-price': thompsonSampling,
  'kelly': kellyStaking,
  'kelly-stake': kellyStaking,
  'use-receipt': useReceiptRegistry,
  'use-registry': useReceiptRegistry,
  'passport': strategyPassport,
  'strategy-passport': strategyPassport
};

export async function handleUpgrade(kind, req, res) {
  const handler = UPGRADE_ROUTES[kind];
  if (!handler) {
    return null; // Not an upgrade route, let main router handle
  }
  
  try {
    return await handler(req, res);
  } catch (error) {
    return res.status(500).json({
      error: 'Upgrade handler failed',
      kind,
      message: error.message
    });
  }
}

export function getUpgradeInfo() {
  return {
    upgrades: Object.keys(UPGRADE_ROUTES),
    sources: [
      'github.com/dolepee/shadow (3rd)',
      'github.com/mrgtee/precall (2nd)',
      'github.com/Cassxbt/talos',
      'github.com/enliven17/mimir (1st)',
      'github.com/Ridwannurudeen/tollgate',
      'github.com/a-apin/archimedes (standout)'
    ],
    version: '0.8.0-upgrades'
  };
}

export default { handleUpgrade, getUpgradeInfo, UPGRADE_ROUTES };
