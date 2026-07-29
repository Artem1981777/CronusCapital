// Machine-readable description of the routes added on top of the original API (caps-1).
// The older /api/info?kind=openapi is left untouched: it documents the original 11 paths.
// This route complements it and spells out the ok / dataProvenance / refusal semantics.
export const CAPABILITIES_VERSION = "caps-1"

export const ENDPOINTS = [
  { path: "/api/council", kind: "council", aliases: ["council-consensus"],
    what: "A three-role council (technical/fundamental/contrarian) on real LLMs, 2-of-3 quorum.",
    params: { topic: "free-text topic", instId: "OKX instrument, defaults to BTC-USDC" },
    returns: ["consensus", "confidence", "validVotes", "counts", "dissent", "votes[].model", "providers", "providersAttempted", "providersFailed", "errors", "failover"],
    refusals: ["no_llm_keys", "market_unavailable"],
    honesty: "providers lists only the votes that counted; every provider queried and every provider that failed is reported in providersAttempted/providersFailed. If a role's provider is unavailable, the role is re-asked of a live provider and that substitution is recorded in failover." },
  { path: "/api/kelly", kind: "kelly", aliases: ["kelly-stake"],
    what: "Kelly-criterion stake sizing on the real track record held in the stake ledger.",
    params: { acceptSmallSample: "1 - accept a sample smaller than KELLY_MIN_GRADED", bankroll: "optional bankroll override" },
    returns: ["stake", "kellyData", "conviction", "expectedValue", "capped"],
    refusals: ["ledger_unreachable", "empty_ledger", "insufficient_sample", "confidence_invalid", "market_unavailable", "no_llm_keys"],
    honesty: "hits/graded come from kv:cronus:stakes:ledger. Nothing is defaulted in: on a thin sample the route refuses instead of guessing." },
  { path: "/api/thompson", kind: "thompson", aliases: ["thompson-price"],
    what: "Thompson-sampling price based on real purchases recorded in x402 receipts.",
    params: { payer: "payer address", successRate: "assumed conversion rate", acceptUnobserved: "1 - accept an unobserved conversion rate" },
    returns: ["priceUsdc", "history", "posterior", "clampDiagnosis", "priceDependsOnObservations", "determinism", "assumptions"],
    refusals: ["payer_required", "no_receipts", "cold_start_no_purchase_history", "no_conversion_observations", "receipts_unreachable"],
    honesty: "clampDiagnosis proves when the resulting price is pinned to the cap and therefore does not depend on the observations at all. successRate is labeled assumption_not_observation." },
  { path: "/api/passport", kind: "passport", aliases: ["strategy-passport"],
    what: "Strategy passport built on a live council verdict, with the trace record hash recomputed.",
    params: { instId: "OKX instrument" },
    returns: ["passport", "validation", "integrityRecheck", "hashFormatCheck", "legacyIntegrityCheck", "traceRecord", "council"],
    refusals: ["market_unavailable", "no_llm_keys", "council_unavailable"],
    honesty: "Integrity is established by recomputing sha256 in integrityRecheck. The validation.integrity field is a legacy 66-character length test that cannot pass under the sha256:<64 hex> format, and is reported rather than quietly dropped." },
  { path: "/api/shadow-float", kind: "shadow-float", aliases: [],
    what: "Description of ShadowFloat credit lines.",
    params: {}, returns: ["features", "note"], refusals: [],
    honesty: "descriptive_only: this route describes capabilities, it does not execute them. dataProvenance.synthetic = true." },
  { path: "/api/use-receipt", kind: "use-receipt", aliases: ["use-registry"],
    what: "Description of the use-receipt registry (anchor/settle).",
    params: {}, returns: ["actions", "features", "note"], refusals: [],
    honesty: "descriptive_only: dataProvenance.synthetic = true." },
  { path: "/api/rigor", kind: "rigor", aliases: ["alpha-passport"],
    what: "Statistical gate on any edge claim: walk-forward, Deflated Sharpe and PBO on real OKX candles.",
    params: { instId: "OKX instrument, defaults to BTC-USDT", bar: "timeframe, defaults to 1H", limit: "how many bars to pull" },
    returns: ["edgeClaim", "mayAdvertiseEdge", "blockers", "deflatedSharpe", "oosTStat", "inSampleSharpe", "oosSharpe", "oosTrades", "probabilityOfBacktestOverfitting", "chosenThresholdPct", "trials", "disclosure"],
    refusals: ["candles_unavailable", "insufficient_bars"],
    honesty: "The threshold is selected in-sample only; the out-of-sample slice never saw the search. Deflated Sharpe penalizes the number of trials, and the held-out slice must also stand on its own (t >= 2): on pure noise this gate produced DSR 0.99 at t 1.23, which is why DSR alone is not accepted. edgeClaim=unproven forbids advertising an edge publicly, and the edge field in /api/kelly carries NO multiple-testing correction." },
  { path: "/api/capabilities", kind: "capabilities", aliases: [],
    what: "This document.", params: {}, returns: ["endpoints", "contract"], refusals: [],
    honesty: "descriptive_only." },
]

export const CONTRACT = {
  ok: "boolean on every response: either success or a reasoned refusal.",
  kind: "string identifier of the route.",
  reason: "machine-readable refusal cause, present whenever ok=false.",
  "dataProvenance.synthetic": "true - the data is descriptive or generated; false - it was obtained from a real source.",
  "dataProvenance.refusal": "true - the response is a refusal and no values were filled in.",
  "dataProvenance.source": "the specific source of the input data.",
  principle: "Missing data produces a refusal, never a default value.",
}

export default async function capabilities(req, res) {
  return res.status(200).json({
    ok: true,
    kind: "capabilities",
    version: CAPABILITIES_VERSION,
    note: "Complements /api/info?kind=openapi: documents the routes added on top of the original API.",
    endpointCount: ENDPOINTS.length,
    endpoints: ENDPOINTS,
    contract: CONTRACT,
    dataProvenance: {
      version: CAPABILITIES_VERSION, synthetic: true, live: false,
      source: "lib/council/capabilities.js (static route description)",
      computation: "descriptive_only",
      note: "This document describes route behaviour and does not itself read any data.",
    },
  })
}
