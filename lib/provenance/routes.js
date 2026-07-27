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
  note: "Схема и валидация паспорта настоящие; решение внутри — демонстрационное. "
    + "Поле verification.traceHash отсутствует, поэтому целостность НЕ подтверждена — см. integrityRecheck.",
})

const kelly = wrapHandler(kellyInner, {
  synthetic: true,
  source: "lib/upgrades/kellyStaking.js",
  endpointKind: "kelly-stake",
  inputs: "hardcoded_demo_values (conviction 0.7, дефолтный банкролл)",
  computation: "real_kelly_formula",
  note: "Формула Келли считается по-настоящему, но входные conviction и банкролл — демонстрационные. "
    + "Размер ставки не отражает реальную позицию.",
})

const thompson = wrapHandler(thompsonInner, {
  synthetic: true,
  source: "lib/upgrades/thompsonSampling.js",
  endpointKind: "thompson-price",
  inputs: "cold_start_prior (alpha 1, beta 1 — истории покупок нет)",
  computation: "real_beta_sampling",
  note: "Сэмплирование из бета-распределения настоящее, но апостериорное распределение "
    + "равно априорному: наблюдений ноль, поэтому цена не обучена на данных.",
})

const shadowFloat = wrapHandler(shadowInner, {
  synthetic: true,
  source: "lib/upgrades/creditLine.js",
  endpointKind: "shadow-float",
  inputs: "none (эндпоинт описывает возможности, данных не возвращает)",
  computation: "descriptive_only",
  note: "Ответ перечисляет возможности примитива, а не состояние кредитных линий. "
    + "Ни одна кредитная линия не открыта.",
})

const useReceipt = wrapHandler(receiptInner, {
  synthetic: true,
  source: "lib/upgrades/useReceiptRegistry.js",
  endpointKind: "use-receipt-registry",
  inputs: "none (эндпоинт описывает возможности, данных не возвращает)",
  computation: "descriptive_only",
  note: "Ответ перечисляет возможности реестра, а не привязанные интенты. "
    + "Ни один интент не закреплён.",
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
