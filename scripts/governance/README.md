# Governance operations

The scripts that moved this deployment from a single hot key to a fully cold 2-of-3 multisig, in the order they were run. They are kept because the contracts and the proofs were already public while the *procedure* was not, and a containment design nobody can execute is a diagram.

Every script reads its keys from files outside the repository (`~/.cronus-cold.env`, `~/.cronus-buyer.env`, mode 600) and never prints a key, only the variable name it looked for when a lookup fails. Each one runs a preflight before sending anything: it checks that the signers are owners, that they hold gas, and that the resulting state would still satisfy the multisig threshold. None of them take a `--force` flag.

## Order

1. `gov-add-owner.mjs` — adds a fresh cold owner to the multisig. Run this **first**. `removeOwner` requires `owners.length - 1 >= threshold`, so a signer set must grow before it can shrink.
2. `gov-queue-guardian.mjs` — queues `extSetGuardian` on the guard through the multisig. Every privileged setter is `onlyThis`, so the owner can only queue, wait out `timelockDelay` (172800s here), then execute. The op id is `keccak256(abi.encode(data, salt))`; the script writes `governance-op.json` with the id, the salt, the calldata and the `eta`, because the execute step must reproduce the exact bytes.
3. `gov-exec-guardian.mjs` — executes the queued op once `opEta` has passed. Refuses to run early rather than letting the contract revert, so a mistimed run costs nothing.
4. `gov-remove-hot.mjs` — removes the agent hot key from the signer set. `addOwner`/`removeOwner`/`setThreshold` are `onlyWallet`, so this is a multisig transaction whose `to` is the multisig itself.

## Shape of a multisig action

`submit(to, value, data)` auto-confirms the submitter, so a 2-of-N action is three transactions: submit from signer A, `confirm(id)` from signer B, `execute(id)` from either. Each script prints the tx id it expects before sending, and every hash with its block after.

## If a run dies halfway

Do not re-run it. A resubmitted `submit` creates a second pending transaction with the same intent, and executing both is not always a no-op. Read `txCount()` and `confirmed(id, signer)`, then finish the specific id by hand.

## Live record

This sequence was executed on Arc testnet on 2026-08-09 and 2026-08-11. The guardian handover was queued publicly with its executable time (`2026-08-11T01:52:02Z`) while the corresponding invariant was still published as failing, and executed at that time in multisig tx #4; the hot key left the signer set in tx #5. Hashes are in `CHANGELOG.md` and `docs/rogue-agent-containment.md`. `/api/governance` reads the resulting state live with `eth_call` and no keys.
