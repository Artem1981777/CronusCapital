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

## Who controls the controller? (governance terminator)

A guard begs the question: who controls the owner - and who controls *that* controller, forever upward? That regress only exists if the top holds **positive power** (the ability to move funds). `CronusAgentGuardV2` terminates it by removing the need to trust the top at all:

- **Immutable hard caps.** `MAX_PER_TX_CAP` / `MAX_DAILY_CAP` are fixed at deploy; even the owner can only lower the active caps, never exceed the ceiling.
- **Timelock on every owner action.** Changes are queued, delayed, and public - vetoable during the delay. Power shifts from who acts to who can watch and stop in time (everyone).
- **Guardian = negative power only.** It can `pause()`, veto a queued op, and remove an allowlist entry - never move funds or raise limits. A corrupt stopper can at worst halt the system, which is the safe state.
- **Immutable cold recovery + exit.** The recovery address is fixed forever and can `emergencyExit()` the full balance home at any time, independent of owner/operator/guardian. Each stakeholder's exit right is the terminal control.
- **Renounceable ownership.** `renounceOwnership()` freezes the rules permanently - after that there is no top to control; the byte-code is the final constitution.

The buck stops at math (thresholds) + immutable code + the exit right + public verifiability - not at an infinitely tall tower of human controllers.

### Live (Arc testnet)
- **CronusAgentGuardV2:** `0xCE9B824231bACEDB102D2848e4e1cf3D35eC595d`
- **Deploy tx:** `0x226b0762c1531453db6d9f747c06eedc9dba30a65388e7b94eb8855b42ed4c03`
- **Tests:** `forge test --match-contract CronusAgentGuardV2Test` -> 13/13 passing.


### Hardened production config (multisig owner + cold recovery)

The V2 guard is now owned by an on-chain **2-of-3 multisig** (no single key can change the rules), and its exit sink is an **immutable cold recovery** address. This closes the "who controls the controller" regress in practice, not just in theory.

| Component | Address |
| :-- | :-- |
| CronusAgentGuardV2 (hardened) | `0xeA4788164c63B0EF2788d9c74859B43f42BC391E` |
| CronusMultisig (owner, 2-of-3) | `0xde8874C53D82a38c1c2864ea575f9E62Dc29dA5F` |
| Cold recovery (immutable exit) | `0x99d0Da7e02c605e9Efe6b06226433770DBafEEac` |
| Operator (AI hot key) | `0xB8D0054Dd4FE76115E75BF196d89E760bbCD3bc6` |

- Guard deploy tx: `0x83667368e256c7a84e783a49baed7185f2256241b18f21ae219ff93696b2aa31`
- Multisig deploy tx: `0xff488479f2b20b44b9c36924795d56dfb3616d2bcd24d3218f10a7e025eaff5e`
- Immutable hard caps: 50 USDC per-tx / 500 USDC daily. Timelock delay: 172800s (48h).
- Proofs: multisig unit tests 12/12, guard V2 unit tests 13/13, and `verify-governance.mjs` asserts the live on-chain wiring (14/14).
