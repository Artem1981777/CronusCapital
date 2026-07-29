// lib/provenance/routes.js — обёртки над заглушками из lib/upgrades/. ADDITIVE.
// Ни один файл в lib/upgrades/ не изменён: обработчики вызываются как есть,
// а их ответ честно помечается происхождением данных.
//   synthetic  — про ВХОДНЫЕ ДАННЫЕ (зашиты в код или получены в рантайме)
//   computation — про МАТЕМАТИКУ (настоящая формула или описательная заглушка)
import { wrapHandler } from "./wrap.js"
import passportInner from "../upgrades/strategyPassport.js"
import kellyInner from "../upgrades/kellyStaking.js"
import thompsonInner from "../upgrades/thompsonSampling.js"
import shadowInner from "../upgrades/creditLine.js"
import receiptInner from "../upgrades/useReceiptRegistry.js"

const passport = wrapHandler(passportInner, {
  synthetic: true,
  source: "lib/upgrades/strategyPassport.js",
  endpointKind: "strategy-passport",
  inputs: "hardcoded_demo_decision (verdict BUY, confidence 0.72, cogs 0.005)",
  computation: "real_schema_validation",
  note: "The passport schema and validation are real; the decision inside is a demo. "
    + "verification.traceHash is absent, so integrity is NOT established here - see integrityRecheck.",
})

const kelly = wrapHandler(kellyInner, {
  synthetic: true,
  source: "lib/upgrades/kellyStaking.js",
  endpointKind: "kelly-stake",
  inputs: "hardcoded_demo_values (conviction 0.7, default bankroll)",
  computation: "real_kelly_formula",
  note: "The Kelly formula is computed for real, but the conviction and bankroll inputs are demo values. "
    + "The stake size does not reflect a real position.",
})

const thompson = wrapHandler(thompsonInner, {
  synthetic: true,
  source: "lib/upgrades/thompsonSampling.js",
  endpointKind: "thompson-price",
  inputs: "cold_start_prior (alpha 1, beta 1 - no purchase history)",
  computation: "real_beta_sampling",
  note: "The beta sampling is real, but the posterior "
    + "equals the prior: zero observations, so the price has learned nothing from data.",
})

const shadowFloat = wrapHandler(shadowInner, {
  synthetic: true,
  source: "lib/upgrades/creditLine.js",
  endpointKind: "shadow-float",
  inputs: "none (this endpoint describes capabilities and returns no data)",
  computation: "descriptive_only",
  note: "The response lists what the primitive can do, not the state of any credit line. "
    + "No credit line is open.",
})

const useReceipt = wrapHandler(receiptInner, {
  synthetic: true,
  source: "lib/upgrades/useReceiptRegistry.js",
  endpointKind: "use-receipt-registry",
  inputs: "none (this endpoint describes capabilities and returns no data)",
  computation: "descriptive_only",
  note: "The response lists what the registry can do, not any anchored intent. "
    + "No intent has been anchored.",
})

export const PROVENANCE_ROUTES = {
  "passport": passport,
  "strategy-passport": passport,
  "kelly": kelly,
  "kelly-stake": kelly,
  "thompson": thompson,
  "thompson-price": thompson,
  "shadow-float": shadowFloat,
  "use-receipt": useReceipt,
  "use-registry": useReceipt,
}

export default PROVENANCE_ROUTES
