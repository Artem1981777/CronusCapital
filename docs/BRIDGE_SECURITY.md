# Bridge Security Assessment — Cronus USDC Bridge (Circle CCTP V2)

_Last updated: 2026-07-31. Scope: `src/components/CronusBridge.tsx` and `scripts/bridge.mjs`._

## 1. Summary

The Cronus dashboard bridge moves native USDC between **Arc Testnet** and major EVM
testnets (Base, Ethereum, Arbitrum, Optimism, Avalanche) using **Circle CCTP V2
burn-and-mint**. It is **non-custodial**: there is no Cronus-owned vault, pool, or
relayer in the value path. Every state-changing transaction (approve, burn, mint) is
signed by the visitor's own connected wallet. Cronus never holds the user's key and
never takes custody of funds in transit.

## 2. Trust model

| Party | Trusted for | Not trusted for |
|---|---|---|
| Circle CCTP V2 contracts | Burning USDC and minting the canonical amount on the destination domain | — |
| Circle Iris attestation service | Producing the attestation that authorizes the mint | Holding funds (it cannot; it only signs messages) |
| User's wallet (MetaMask / OKX / injected) | Signing and broadcasting every tx | — |
| Cronus front-end | Building calldata and showing status | Custody — it has no signing key and no privileged contract |

There is **no Cronus admin key, no upgradeable proxy owned by Cronus, and no pause/
withdraw authority** anywhere in the bridge path. Removing the front-end entirely does
not put any in-flight funds at risk — a burned transfer can always be minted directly
against Circle's `MessageTransmitterV2` with the burn tx hash and attestation.

## 3. Contracts used (Circle-owned, verified)

CCTP V2 contracts are identical across all supported EVM testnets, including Arc:

| Contract | Address |
|---|---|
| TokenMessengerV2 (burn) | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| MessageTransmitterV2 (mint) | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |

USDC token per chain:

| Chain | Domain | USDC |
|---|---|---|
| Arc Testnet | 26 | `0x3600000000000000000000000000000000000000` |
| Base Sepolia | 6 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Ethereum Sepolia | 0 | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Arbitrum Sepolia | 3 | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |
| OP Sepolia | 2 | `0x5fd84259d66Cd46123540766Be93DFE6D43130D7` |
| Avalanche Fuji | 1 | `0x5425890298aed601595a70AB815c96711a31Bc65` |

Addresses are pinned in source and cross-checked against
<https://developers.circle.com/cctp/references/contract-addresses>.

## 4. Transaction flow

1. `approve(TokenMessengerV2, amount)` on the source-chain USDC — signed by the user.
2. `depositForBurn(amount, destDomain, mintRecipient, burnToken, destCaller=0x0, maxFee, minFinalityThreshold=1000)` — burns USDC on the source chain.
3. Poll Circle Iris (`/v2/messages/{sourceDomain}?transactionHash=`) until `status == "complete"` and a non-`PENDING` attestation is available.
4. `receiveMessage(message, attestation)` on the destination `MessageTransmitterV2` — mints the canonical USDC to the recipient.

`mintRecipient` is the connected wallet, zero-padded to bytes32. `destinationCaller` is
zero (anyone can submit the mint), so the mint is never censorable by Cronus.

## 5. Client-side hardening

- **Balance preflight** — reads `balanceOf` and aborts before any signature if the wallet cannot cover the amount.
- **Allowance preflight + poll** — reads `allowance`; only approves when needed, then polls up to 10×1.5s so the burn is not submitted against a not-yet-indexed allowance (this removes the `approve -> burn` race that caused wallet "transaction may fail" rejections).
- **Burn simulation** — `simulateContract` runs before the real `depositForBurn`, surfacing reverts as readable errors instead of a failed on-chain send.
- **Safe failure** — if attestation times out, the UI states the burn is safe and the mint can be completed later; the burn hash is persisted in local history.

## 6. Residual risks and limitations

- **Testnet only.** Uses Iris sandbox (`iris-api-sandbox.circle.com`) and testnet USDC. Mainnet requires the production Iris endpoint and a fee/amount policy (tracked separately).
- **Attestation latency.** Mint waits on Circle; the UI caps the wait at ~5 min and degrades gracefully.
- **Front-end integrity.** The dashboard is served from Vercel; users should verify the source on GitHub. Calldata is deterministic and independently reproducible.
- **Native gas required** on both source and destination chains for the user's own signatures.
- **Arc RPC** is proxied via `/api/rpc`; a proxy outage only blocks UX, never funds.

## 7. How to verify independently

Every bridge is fully reconstructable on-chain from the burn tx hash. See the
**Live bridge transactions** table in the project README for verified round-trip
transfers (Base <-> Arc, both directions) with explorer links to the burn and mint of
each leg.
