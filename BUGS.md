# Cronus Capital — Known Limitations & Open Items

Honest list of caveats and things we would fix with more time. Kept public on purpose.

## Known limitations

- **No external payers yet.** `external_payers = 0` by design until a real third party pays and is allow-listed. See `TRACTION.md`.
- **Batching at testnet.** Circle Gateway batches many signed authorizations into one settlement at scale; on Arc testnet each call currently settles individually (1:1 observed), so batch efficiency is demonstrated logically, not yet at volume.
- **RPC trust.** Payment verification reads from public Arc RPC endpoints; a malicious RPC could return false data. Mitigation: prefer the official endpoint; upgrade path is multi-node cross-check.
- **Freshness window.** Paid x402 calls are accepted within a bounded freshness window; full one-time-use (KV keyed by txHash) is the upgrade path.
- **Treasury hot-wallet.** The autonomous payout signer is a hot wallet in env, bounded by per-payout cap + daily breaker + exec-lock. Upgrade: scoped session key or MPC signer.

## Engineering debt

- **ESLint debt.** A batch of pre-existing lint warnings/errors remains in older UI components; CI stays green on build + Foundry. Scheduled for a dedicated typing/lint pass.
- **Actions Node version.** The MCP-registry publish workflow logs a `Node.js 20 is deprecated` warning; bump `actions/*` when convenient (non-blocking).

## See also

- `TRACTION.md` — honest traction methodology and live snapshot
- `DECISIONS.md` — architecture/economic decision log
- `docs/security-threat-model.md` — security properties and trade-offs
