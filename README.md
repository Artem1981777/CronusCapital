# 𓂀 Cronus Capital

**The first AI agent that runs a real business on Arc.**

Cronus is an autonomous oracle that **earns** (x402 paywall), **pays** (per upstream call), **settles** on-chain in USDC, and **reports** its own live revenue — a complete economic loop, not a mockup.

### Live
- App: https://cronus-capital.vercel.app
- Agent contract (Arc Testnet): 0xd81a420BFa4CE8778473BD46195B8E97e928880f
- Explorer: https://testnet.arcscan.app/address/0xd81a420BFa4CE8778473BD46195B8E97e928880f
- Network: Arc Testnet (chain 5042002)

## How it works
1. Consult — 3 reasoning agents analyze a market and reach a verdict.
2. Earn (x402) — premium signals gated behind an x402 paywall; clients pay per call in USDC.
3. Pay — the agent itself pays per upstream inference/data call (agent-to-service nanopayments).
4. Settle — verdicts settle on-chain with a real USDC transaction (FORCE EXECUTE -> arcscan).
5. Report — live revenue bar + on-chain ledger: revenue, paying clients, agent spend, net flow, tx/hr.

## Built on Circle's stack
- x402 pay-per-call monetization (HTTP 402) on Arc
- USDC settlement via Arc Testnet facilitator
- On-chain agent identity surfaced in-app (AGENT ID badge)

## Lepton RFB fit
- RFB 01 — Autonomous paying agents: Cronus spends USDC per call autonomously.
- RFB 02 — Monetize an API/agent: x402 paywall + real revenue metrics.

## Why Cronus is different
Most agent projects show either a marketplace or an identity primitive. Cronus shows a single agent running a full business: it earns, spends, settles, and reports unit economics — all on Arc, all verifiable on-chain.

## Tech
React + Vite + TypeScript · wagmi/viem · Arc Testnet · x402 · Claude (Sonnet) reasoning agents.

## Run locally
Run `npm install` then `npm run dev`.

## Demo flow
Connect wallet (auto-switches to Arc Testnet) -> QUICK CAST a topic -> UNLOCK $0.02 (x402) -> FORCE EXECUTE a real on-chain settlement -> watch REVENUE + ON-CHAIN LEDGER update.

---

# 🏛️ CronusCapital — гид по дашборду

Дашборд сверху вниз: что каждый блок значит и как проверить.

## 1. Радар (верх) 🛰️
Визуализация Scout-агента, сканирующего prediction-маркеты. Зелёные точки — сигналы с +EV, жёлтые — нейтральные. Декоративный слой, задаёт тему «оракул сканирует рынок».

## 2. ⚡ ORACLE ACTIONS

### 🟢 CONSULT ORACLES
Пайплайн: **Scout** (сигналы) → **Analyst** (EV / conviction, Brier-калибровка) → **Executor** (готовит расчёт). Показывает live reasoning-логи. Это reasoning-симуляция — сама оплату не шлёт; реальная x402-оплата описана в секции «x402 — оплата за вызов» ниже.

### 🔵 FORCE EXECUTE
Исполняет settlement on-chain. Pre-flight `eth_call` (abort-on-revert) → подпись → реальный USDC-transfer на Arc → «Settlement confirmed» + ссылка на tx.

## 3. 🏦 Vault — депозит / доход / вывод

### DEPOSIT / WITHDRAW
- **DEPOSIT** — `approve` + `deposit` → начисляются доли (shares), USDC уходит на контракт `0x13B6984357e27dAB17DF44a6396042239e70542C`.
- **WITHDRAW** — `withdrawAll`: сжигает доли, возвращает депозит + доход.

### Your position / Vault TVL
- **Your position** — стоимость твоих долей (`convertToAssets(shares)`).
- **Vault TVL** — весь капитал в пуле (`totalAssets`), виден даже без кошелька.

### ⚙ RUN AGENT STRATEGY (yield engine)
Агент фиксирует прибыль: серверный endpoint подписью стратегического счёта кладёт реализованный P&L в волт через `addYield` → позиция и TVL растут вживую + реальная tx.
Честно: на testnet величина P&L смоделирована (0.02–0.07 USDC), но учёт долей и on-chain распределение настоящие.

## 4. 🟡 RISK ADJUST
Параметры риска агента (пороги conviction, размер позиции).

## 5. VIEW ON ARC ↗
Ссылка на explorer `testnet.arcscan.app`. Открывать в обычном браузере (Kiwi/Chrome), не во встроенном браузере кошелька.

## 6. + DEPLOY NEW AGENT
Демонстрация масштабируемости — развернуть новый экземпляр агента.

## 7. Панели верифицируемости (moat)
- **Verifiable Ledger** — хеш-цепочка решений (keccak256), статус Verified.
- **Reasoning Trace** — content-commitment рассуждений, бейдж REPRODUCIBLE / MISMATCH.
- **Track Record** — hit-rate + Brier score (CALIBRATED).
- **SecOps Panel** — per-tx cap 0.01, daily cap 5.0, 7/7 PASS.
- **ARC NETWORK LIVE** — живой блок-каунтер + RPC-статус.
- **Composability / Moat** — ERC-8183, x402, CCTP, ERC-8004, ERC-4626 + P&L.

## 💸 x402 — оплата за вызов (почему в кошельке 2 транзы)

Это ядро монетизации (Lepton RFB 02). Кнопка разблокировки премиум-сигнала
(компонент `X402Integration`) — **реальный платный вызов** по протоколу x402:
клиент/агент платит контракту Cronus в USDC за доступ к сигналу.

- **Контракт-получатель:** `0xd81a420BFa4CE8778473BD46195B8E97e928880f` (Arc Testnet — задеплоенный агент Cronus).
- **Цена:** ~$0.02 USDC за вызов.
- **Почему 2 транзакции подряд:** платёж идёт батчем (`MEMO + BATCHED PAYMENTS`) — хук `useCronusContract` делает два вызова контракта, поэтому кошелёк просит **две подписи**. Обе — настоящие on-chain транзы в твой контракт, видны в эксплорере. Иногда подпись всего одна — это нормально: после первого `approve` allowance уже выдан, и кошелёк запрашивает только сам платёж (~$0.02).
- В OKX встроенном кошельке они показываются как «Неизвестная транзакция / не удалось расшифровать» — это лишь потому, что у кошелька нет ABI контракта; вызов корректный и безопасный.

> ⚠️ Не путать с **CONSULT ORACLES** на дашборде: та кнопка запускает reasoning-пайплайн (Scout → Analyst → Executor) и сама оплату **не шлёт**. Реальная x402-оплата — именно здесь.
