// lib/council/routes.js - map of the real (non-mock) routes. ADDITIVE.
// Spread into api/info.js AFTER ...UPGRADE_ROUTES and BEFORE the older keys:
// it overrides the stubs but never overrides the 24 pre-existing routes.
// Order: honestly labeled stubs -> live data -> the real council.
import council from "./handler.js"
import { PROVENANCE_ROUTES } from "../provenance/routes.js"
import { mapContract } from "../provenance/wrap.js"
import capabilities from "./capabilities.js"
import { LIVE_ROUTES } from "../provenance/live.js"
import { LIVE_PASSPORT_ROUTES } from "../provenance/livePassport.js"
import { LIVE_THOMPSON_ROUTES } from "../provenance/liveThompson.js"
import { RIGOR_ROUTES } from "../rigor/rigorGate.js"

export const REAL_ROUTES = mapContract(Object.assign({}, PROVENANCE_ROUTES, LIVE_ROUTES, LIVE_PASSPORT_ROUTES, LIVE_THOMPSON_ROUTES, RIGOR_ROUTES, {
  "council": council,
  "council-consensus": council,
  "capabilities": capabilities,
}))

export default REAL_ROUTES
