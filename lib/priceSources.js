// lib/priceSources.js — honest 2nd price source (data-integrity cross-check for /api/consult).
// Thin adapter over the published primitive: arc-honest-money/price-crosscheck.
// Behaviour is unchanged and fail-OPEN by design: on any failure `agree` stays null,
// so the cross-check annotates a verdict but never fabricates a price.
// Implementation lives in npm so it can be forked and audited on its own:
//   https://github.com/Artem1981777/arc-honest-money
export {
  parseBase,
  crossCheckDecision,
  fetchCoinbaseSpot,
  crossCheck,
} from "arc-honest-money/price-crosscheck"
