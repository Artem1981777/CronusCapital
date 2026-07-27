// lib/council/routes.js — карта настоящих (не-мок) маршрутов. ADDITIVE.
// Раскладывается в api/info.js ПОСЛЕ ...UPGRADE_ROUTES и ДО старых ключей:
// перекрывает заглушки, но никогда не перекрывает существующие 24 маршрута.
// Порядок: честно помеченные заглушки -> живые данные -> настоящий совет.
import council from "./handler.js"
import { PROVENANCE_ROUTES } from "../provenance/routes.js"
import { mapContract } from "../provenance/wrap.js"
import capabilities from "./capabilities.js"
import { LIVE_ROUTES } from "../provenance/live.js"
import { LIVE_PASSPORT_ROUTES } from "../provenance/livePassport.js"
import { LIVE_THOMPSON_ROUTES } from "../provenance/liveThompson.js"

export const REAL_ROUTES = mapContract(Object.assign({}, PROVENANCE_ROUTES, LIVE_ROUTES, LIVE_PASSPORT_ROUTES, LIVE_THOMPSON_ROUTES, {
  "council": council,
  "council-consensus": council,
  "capabilities": capabilities,
}))

export default REAL_ROUTES
