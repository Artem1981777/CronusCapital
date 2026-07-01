# Non-custodial browser co-sign (session-EOA)

Cronus lets a user pay for x402 nano-signals **without the server ever holding
their key and without a wallet popup on every tick**. This is implemented in
`src/lib/session.ts` (streamer) + `src/lib/sessionGuard.ts` (money-safety gate)
+ `src/components/StreamSession.tsx` (UI).

## How it works

1. **Ephemeral session key (session-EOA).** `createSession()` generates a fresh
   private key **in browser memory** (`viem` `generatePrivateKey`). It is never
   written to disk/localStorage and is never sent to the server.
2. **One-popup funding.** The user's MAIN wallet (wagmi / MetaMask / WalletConnect)
   signs a single `depositFor` transaction that credits the session key's Circle
   Gateway balance. This is the only wallet popup.
3. **Popup-free streaming.** The session-EOA then signs gas-free EIP-3009
   authorizations for each sub-cent tick via Circle Gateway. Settlements are real
   and verifiable on Arc testnet.

## Why this is non-custodial

- The session private key exists **only** in the user's browser tab memory.
- The server (and Cronus operators) never see it and cannot spend it.
- Treasury/staking server keys are never exposed to the browser; the existing
  server-signed `execute` paths are untouched by this feature.

## Money-safety gate (`sessionGuard.ts`)

Every tick is checked by the pure, unit-tested `decideTick()` before any signing.
Check order (deny wins): **user stop -> session TTL -> per-tx cap -> total budget**.

- `perTxCapUsd` — no single tick may exceed this.
- `budgetUsd` — cumulative spend ceiling for the whole session.
- `ttlMs`/`deadline` — the session self-expires.
- `shouldStop()` — the user can halt instantly.

Because the caps are enforced **in code**, a bug, a hostile response, or a
hallucinated amount can never drain more than the session budget.

## Threat model

| Threat | Mitigation |
|---|---|
| XSS steals the session key | Key is ephemeral, in-memory, short TTL, and hard-capped by budget — a stolen key can spend at most the remaining session budget. |
| Delegate over-spends | `decideTick()` enforces per-tx and total-budget caps deterministically (unit-tested). |
| Replay / stale ticks | Session TTL/`deadline` expires the session; per-tick indices are unique. |
| "Sign anything" phishing | Only the one funding tx is signed by the main wallet; nano-authorizations are scoped Gateway EIP-3009, not arbitrary calls. |
| Main-key exposure | Main wallet signs only the one-time funding deposit; the session-EOA does the rest. |
| False traction | Co-signed self-demo spend is still **self**, not an external payer; TRACTION.md keeps external payers at 0 honestly. |

## No live-burn by default

This layer settles real Gateway nano-payments only when a user explicitly runs a
session from the UI with a funded balance. It fabricates no demand.
