// lib/council/routes.js — карта настоящих (не-мок) маршрутов. ADDITIVE.
// Раскладывается в api/info.js ПОСЛЕ ...UPGRADE_ROUTES и ДО старых ключей:
// перекрывает заглушки, но никогда не перекрывает существующие 24 маршрута.
// Порядок: заглушки с честной маркировкой -> живые данные -> настоящий совет.
import council from "./handler.js"
import { PROVENANCE_ROUTES } from "../provenance/routes.js"
import { LIVE_ROUTES } from "../provenance/live.js"

export const REAL_ROUTES = Object.assign({}, PROVENANCE_ROUTES, LIVE_ROUTES, {
  "council": council,
  "council-consensus": council,
})

export default REAL_ROUTES
