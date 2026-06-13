# Cronus Capital

Autonomous market-intelligence oracle on **Arc Network**: three AI agents (Scout, Analyst, Executor) that surface prediction-market opportunities and settle real **USDC** on-chain, monetized via **x402 pay-per-call**.

- Live: https://cronus-capital.vercel.app
- Repo: https://github.com/Artem1981777/CronusCapital
- Submission: Lepton by Canteen (Arc) — RFB 02 + RFB 06

## Why Arc
- USDC as native gas (settlements priced/paid in USDC)
- x402 pay-per-call micro-monetization of AI inference
- Arc v0.7.2 memos + batched payments for clean reconciliation

## How to use (judges)
1. Install MetaMask and add Arc Testnet (params below).
2. Get test USDC + gas: https://faucet.circle.com
3. Open the live link and click CONNECT to connect MetaMask.
4. Click FORCE EXECUTE, confirm in MetaMask — sends a real 0.01 USDC settlement on Arc Testnet (link to arcscan appears).
5. In the Premium Oracle card: enter a topic, click UNLOCK $0.02, sign — get an AI oracle report (x402 pay-per-call).

Note: FORCE EXECUTE = on-chain transaction. UNLOCK $0.02 = signature-authorized x402 call. CONSULT ORACLES = visual animation.

## Arc Testnet
- Chain ID: 5042002
- RPC: https://rpc.testnet.arc.network
- Explorer: https://testnet.arcscan.app
- USDC: 0x3600000000000000000000000000000000000000

## Tech
React + TypeScript + Vite, wagmi/viem, x402, Anthropic Claude (report generation).
