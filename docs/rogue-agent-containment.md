# Rogue-Agent Containment

**Question:** what happens when an AI agent goes out of control and tries to drain a wallet?

**Answer in Cronus:** nothing catastrophic. The money rail enforces hard limits the agent cannot override. A fully compromised agent key can, at worst, move a bounded amount to a *pre-approved* address — it can never drain the treasury or send funds to a brand-new attacker address.

This document describes `CronusAgentGuard`, an on-chain containment contract, with a reproducible live demo on Arc testnet.

## Threat model

The dangerous surface is **not** the public website — that is non-custodial: every user signs with their own wallet and Cronus never holds anyone's private key. The real risk is the **agent's own operational hot key** used for automated payments. If that process is compromised or the model misbehaves, it could try to sign an arbitrary transfer of the entire balance.

Off-chain policy limits are not enough: a rogue process holding the key can bypass any off-chain check and sign a raw transfer directly. Containment must therefore be **enforced on-chain**.

## Design: least privilege + on-chain enforcement

Funds live in `CronusAgentGuard`. Three separated roles:

| Role | Key type | Powers |
|---|---|---|
| `owner` | cold key / multisig | set limits, allowlist, roles; sweep to recovery; unpause |
| `operator` | AI hot key | **only** `spend()`, bounded by caps + allowlist |
| `guardian` | watcher | `pause()` instantly (circuit breaker) |

### Invariants enforced by the contract
- `spend()` reverts unless the recipient is on the **allowlist** (`recipient not allowlisted`).
- `spend()` reverts above the **per-transaction cap** (`over per-tx cap`).
- `spend()` reverts above the **rolling 24h cap** (`over daily cap`).
- When **paused**, every spend reverts (`paused`).
- The operator **cannot** change limits, allowlist, roles, unpause, or sweep.
- The **only** way the full balance leaves is `sweepToRecovery()` — owner-only, to a fixed cold address.

Net effect: even with the operator key fully compromised, the worst case is bounded by the daily cap and restricted to already-trusted recipients.

## Test coverage (Foundry)

`forge test --match-contract CronusAgentGuardTest` → **11/11 passing**:
- rogue drain to a non-allowlisted address → revert; vault intact; attacker gets 0
- over per-tx cap → revert
- daily cap reached → revert; never more than the cap leaves
- daily window resets after 24h
- guardian pause blocks spends
- operator cannot sweep / change allowlist / raise limits / unpause
- happy-path bounded spend succeeds
- owner recovery sweep moves the full balance only to the recovery address

## Live proof (Arc testnet)

- **Contract:** `0x363A585faeECC19c001978e7674EB0D52a641181`
- **Deploy tx:** `0x55677f5a911a8ffefd2a487e6fa476bd087ea5101d8f1522ce40befe205c9a25`

Running `rogue-demo.mjs` against the live contract:

| Scenario | Attempt | Result |
|---|---|---|
| A | drain full balance to a brand-new address | BLOCKED — `recipient not allowlisted` |
| B | payment above the per-tx cap | BLOCKED — `over per-tx cap` |
| C | bounded, allowlisted payment (1 USDC) | SUCCESS — tx `0x0248805ba499a11bdc51adeae656df194bfd77618e48a1a152f626e71b6bf59c` |

Explorer: https://testnet.arcscan.app/

## Reproduce
    forge test --match-contract CronusAgentGuardTest -vv   # 11/11
    node deploy-agent-guard.mjs                            # deploy (roles + caps via env)
    node rogue-demo.mjs                                    # live: rogue paths revert, bounded payment succeeds

## Files
- `contracts/CronusAgentGuard.sol` — containment contract
- `contracts/test/CronusAgentGuard.t.sol` — 11 tests
- `deploy-agent-guard.mjs` — deployer (roles + caps via env)
- `rogue-demo.mjs` — live rogue-agent simulation
