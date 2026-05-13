# CRONUS CAPITAL
### Autonomous Market Intelligence on Arc Network

> All things are an exchange for fire, and fire for all things
> Heraclitus, Fragment 90

**Live:** https://cronus-capital.vercel.app
**Contract:** 0xd81a420BFa4CE8778473BD46195B8E97e928880f
**Network:** Arc Testnet (Chain ID: 5042002)

Built for Agora Agents Hackathon - Canteen x Circle x Arc

---

## What is Cronus Capital?

Three-agent autonomous market intelligence system. Monitors prediction markets 24/7, finds +EV opportunities, logs decisions on-chain via Arc at ~$0.01 per TX.

---

## The Three Oracles

SCOUT -> ANALYST -> EXECUTOR -> ARC ON-CHAIN

| Oracle | Role | Output |
|--------|------|--------|
| Scout | Market Intelligence | Signals with confidence scores |
| Analyst | Expected Value Engine | +EV bets sized in USDC |
| Executor | Decision Layer | Risk management, logs to Arc |

---

## Arc Integration

| Feature | Detail |
|---------|--------|
| Network | Arc Testnet - EVM L1 by Circle |
| Chain ID | 5042002 |
| Settlement | USDC |
| Finality | Sub-second deterministic |
| TX Cost | ~$0.01 per transaction |
| Contract | CronusDecisions.sol |
| Live Stats | Block + gas price, updates every 5s |

---

## Wallet Support

MetaMask, WalletConnect, OKX Wallet, Nightly, Injected

---

## Tech Stack

- Frontend: React + TypeScript + Vite
- Blockchain: wagmi + viem -> Arc Network
- AI: Claude (Anthropic) - 3 specialized agents
- Settlement: USDC on Arc testnet
- Wallet: Reown AppKit
- Deploy: Vercel

---

## Roadmap (Day 1 - work in progress)

- [ ] Real Polymarket API integration
- [ ] USDC Gateway cross-chain flows
- [ ] Automated position execution
- [ ] Performance bond system
- [ ] Multi-user analytics
- [ ] Loom demo video

---

## Run Locally

git clone https://github.com/Artem1981777/CronusCapital
cd CronusCapital && npm install && npm run dev

---

## Builder

Artem Gromov - Solo Web3/AI developer

- GitHub: @Artem1981777
- Twitter: @ArtemGromov777
- Telegram: @Artem00777
- Code4rena auditor: shadowwarden

---

Cronus Capital - Agora Agents Hackathon 2026 - Arc x Circle x USDC
Building in public. Shipping daily.
