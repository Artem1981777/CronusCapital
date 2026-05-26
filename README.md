# Cronus Capital - Arc Starter Kit

> Autonomous Market Intelligence on Arc Network

**Live Demo:** https://cronus-capital.vercel.app
**Network:** Arc Testnet (Chain ID: 5042002)
**Contract:** 0xd81a420BFa4CE8778473BD46195B8E97e928880f

Built for **Agora Agents Hackathon** - Arc x Circle x USDC

---

## Quick Start (5 minutes)

    git clone https://github.com/Artem1981777/CronusCapital
    cd CronusCapital
    cp .env.example .env
    npm install
    npm run dev

Open http://localhost:5173

---

## Environment Setup

| Variable | Where to get it |
|---|---|
| VITE_ANTHROPIC_API_KEY | https://console.anthropic.com |
| VITE_WALLETCONNECT_PROJECT_ID | https://cloud.walletconnect.com |
| VITE_ARC_RPC_URL | Arc Testnet RPC (default provided) |

---
## How It Works

SCOUT -> ANALYST -> EXECUTOR -> Arc On-Chain Log

| Agent | Role | Output |
|---|---|---|
| Scout | Market Intelligence | Signals + confidence scores |
| Analyst | Expected Value Engine | +EV bets sized in USDC |
| Executor | Decision Layer | Risk management + Arc TX |

---

## Arc Network

| Feature | Detail |
|---|---|
| Network | Arc Testnet - EVM L1 by Circle |
| Chain ID | 5042002 |
| Settlement | USDC |
| TX Cost | ~$0.01 per transaction |
| Finality | Sub-second deterministic |

Add to MetaMask: RPC https://rpc.arc-testnet.circle.com / Chain ID 5042002

---
## Tech Stack

- Frontend: React + TypeScript + Vite
- Blockchain: wagmi + viem -> Arc Network
- AI Agents: Claude (Anthropic) - 3 specialized agents
- Settlement: USDC on Arc Testnet
- Wallet: Reown AppKit
- Deploy: Vercel

---

## Deploy Your Own

1. Fork this repo
2. Go to https://vercel.com/new and import your fork
3. Add env variables in Vercel dashboard
4. Deploy - live in 2 minutes

---

## Builder

Artem Gromov - Solo Web3/AI Developer
- GitHub: @Artem1981777
- Twitter: @ArtemGromov777
- Telegram: @Artem00777
- Code4rena: shadowwarden

*Cronus Capital - Agora Agents Hackathon 2026 - Arc x Circle x USDC*
