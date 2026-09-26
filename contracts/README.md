# contracts/

Owner: **Developer 2**

Foundry project for the DBForge Solidity contracts (mission escrow, submission
acceptance, MON reward payouts and dataset provenance) targeting Monad Testnet.
The interfaces follow [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), which is the single source of truth.

Production-oriented, **not audited**.

## Layout

- `src/MissionVault.sol` — holds all mission funds, pays per approved sample, cancel + refund
- `src/MissionFactory.sol` — buyer entry point: create + fund a mission in one tx
- `src/ProvenanceRegistry.sol` — verifier anchors the dataset Merkle root, buyer finalizes it
- `src/interfaces/` — `IMissionVault`, `IMissionFactory`, `IProvenanceRegistry` (structs + events)
- `src/Errors.sol` — shared custom errors
- `test/` — unit, fuzz, invariant (`test/invariant/`) and Monad testnet fork tests
- `script/` — deploy scripts (G5)

## Setup

Requires Foundry **≥ 1.8** (Monad support). On Windows use Git Bash or WSL.

```bash
cd contracts
forge soldeer install        # OpenZeppelin 5.4.0 + forge-std 1.11.0, pinned by soldeer.lock
forge build
```

Dependencies live in `contracts/dependencies/` (git-ignored); no git submodules.

## Tests

```bash
forge test -vv                                   # unit + fuzz + invariants (fork tests skip)
forge coverage --report summary --no-match-coverage "(test|script)/"
forge test --fork-url https://testnet-rpc.monad.xyz --match-contract Fork -vv   # Monad testnet fork
```

Constructors: `MissionVault(admin)`, `MissionFactory(vault)`, `ProvenanceRegistry(admin, vault)`.
After deploy the admin calls `vault.setFactory(factory)` once and grants `VERIFIER_ROLE`
to the backend verifier on both the Vault and the Registry.
