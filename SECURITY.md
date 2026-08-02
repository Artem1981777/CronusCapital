# Security Policy

Cronus Capital is an autonomous agent stack on Arc: an AMM pool, a CCTP V2 USDC
bridge, an ERC-8004 identity/reputation/escrow set, and a small `api/` surface.
This document states what we protect, how, and how to report a problem.

## Reporting a vulnerability

- Email: **artemgromov629@gmail.com** with subject `SECURITY: <short title>`.
- Please include impact, a reproduction, and the commit hash you tested.
- Do not open a public issue for anything that could move or lock funds.
- We aim to acknowledge within 72 hours and to agree a disclosure timeline
  before any public write-up.

Good-faith research is welcome. Do not run destructive tests against live
testnet/mainnet deployments; use a local fork instead.

## Scope

In scope:
- `contracts/CronusSwap.sol` — constant-product AMM (pool + test token).
- `contracts/*.sol` — identity registry, reputation, job escrow, vault.
- `scripts/bridge.mjs` — local CCTP V2 bridge helper.
- `lib/intentPolicyCore.js` — intent limits and route allow-list.
- `api/*` — request handlers deployed on Vercel.

Out of scope:
- Third-party infrastructure: Circle CCTP contracts and IRIS, Arc RPC, Vercel,
  npm registry. Report those to the respective vendor.
- Arc testnet instability, faucet issues, or gas-price griefing on a testnet.
- Findings that require a leaked private key or compromised owner account.

## Threat model

Assets: pooled USDC/CRN liquidity, bridge transfer amounts, and the treasury key
used by automated payouts. Adversaries we design against:

1. **Hostile trader / token.** Cannot re-enter the pool: `swapExactIn`,
   `addLiquidity` and `removeLiquidity` are `nonReentrant`. Reserves are tracked
   internally, not read from `balanceOf`, so token donations cannot shift price.
   The invariant `reserveA * reserveB` is asserted to never shrink on a swap.
2. **Stale / front-run fills.** `swapExactIn` takes a `deadline` and a real
   `minOut`; a swap stuck past its deadline reverts instead of filling at a
   stale price, and zero-slippage swaps are the caller's explicit choice.
3. **Operator error at the bridge.** `scripts/bridge.mjs` validates the amount
   (positive, ≤6 decimals), enforces a `BRIDGE_MAX_AMOUNT` fat-finger cap,
   refuses non-testnet routes unless `BRIDGE_ALLOW_MAINNET=1`, requires an
   explicit `BRIDGE_MAX_FEE` on mainnet, and asks for a typed confirmation
   before moving real USDC.
4. **Bug in pricing or a dependency.** The pool owner can `pause()` swaps via a
   circuit breaker. Pausing does not touch liquidity: `removeLiquidity` stays
   callable so funds can always be recovered.
5. **Permissioned-asset confusion.** USYC is never swapped or held. The intent
   policy refuses USYC routes rather than faking a position, and the entitlements
   contract answers false for our address anyway.

## Secrets

- No private keys are committed. `.env*` is git-ignored; `.env.example` holds
  placeholders only.
- Signing keys (`BRIDGE_PRIVATE_KEY`, `TREASURY_PRIVATE_KEY`) are read from the
  environment at run time and never logged.
- Repository history has been scanned; no live secrets are present.

## Known items / backlog

- `api/agent-payout.js` currently authorizes via a `secret` query parameter,
  which can appear in server/proxy logs. Migration to an `Authorization: Bearer`
  header is planned; the handler already warns on the legacy path.
- Before mainnet: move pool ownership to a Safe multisig / timelock, rotate and
  segregate the deployer and payout keys, use a single-purpose bridge wallet,
  narrow the npm token with 2FA, enable Dependabot, and add reserve/removal
  alerts in `lib/alerts.js`.

## Testing

Run the full suite before trusting a change:

    forge test -vv         # Solidity: AMM, escrow, identity, reputation, vault
    node --test test/*.test.mjs   # JS: api handlers, intent policy, receipts
