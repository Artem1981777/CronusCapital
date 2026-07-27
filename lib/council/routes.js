// lib/council/routes.js — карта настоящих (не-мок) маршрутов. ADDITIVE.
// Раскладывается в api/info.js ПОСЛЕ ...UPGRADE_ROUTES и ДО старых ключей:
// перекрывает заглушки, но никогда не перекрывает существующие 24 маршрута.
import council from "./handler.js"
import { PROVENANCE_ROUTES } from "../provenance/routes.js"

export const REAL_ROUTES = Object.assign({}, PROVENANCE_ROUTES, {
  "council": council,
  "council-consensus": council,
})

export default REAL_ROUTES
