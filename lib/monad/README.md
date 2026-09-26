# lib/monad/

Owner: **Developer 2**. Contract spec: `contracts/docs/ARCHITECTURE.md` v2 (§3, §6–§8).

Server-side settlement adapter for the MissionVault on Monad (G6). The ABI, the address, the chain settings, the
signing key and the nonce handling stay inside this folder. Callers see only the functions below.
(Client-side wagmi helpers are a separate task, G9.)

> **settled = bakiyeye yazıldı; para contributor withdraw edince çıkar. withdrawn durumunu
> `getContributorBalance` / `Withdrawn` event'lerinden takip edin.**
> *Settled means "credited to the contributor's on-chain balance". MON leaves the Vault only on `withdraw` /
> `withdrawFor`. Track payouts with `getContributorBalance` or the `Withdrawn` events.*

## Use (server only)

```ts
// app/api/.../route.ts: never from a client component (`import "server-only"` breaks that build)
import { createMonadSettlement, createSupabaseSettlementStore, isMonadSettlementError } from "@/lib/monad";
import { getSupabaseServiceClient } from "@/lib/supabase/client";

const monad = createMonadSettlement({ store: createSupabaseSettlementStore(getSupabaseServiceClient()) });

try {
  const { txHash, amount, status } = await monad.settleSubmission({
    chainMissionId: mission.chainMissionId,        // missions.chain_mission_id
    contributorAddress: submission.contributorAddress,
    submissionHash: `0x${submission.mediaHash}`,   // 0x + 64 hex (SHA-256)
  });
  // status === "settled", amount = wei string → submissions.status = "paid", submissions.tx_hash = txHash
} catch (e) {
  if (isMonadSettlementError(e)) return Response.json(e.toJSON(), { status: 502 }); // safe: no key, no raw RPC
  throw e;
}
```

Create one adapter per process. You can run many processes at the same time: the store coordinates idempotency
and nonces (there is no single-worker rule).

## Environment (server only, never `NEXT_PUBLIC_`)

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `MONAD_VERIFIER_PRIVATE_KEY` | yes | — | Verifier hot wallet (`VERIFIER_ROLE`). It is never logged or returned. |
| `MONAD_VAULT_ADDRESS` | yes | — | MissionVault address |
| `MONAD_REGISTRY_ADDRESS` | for datasets | — | ProvenanceRegistry. `anchorDataset`, `getDataset` and `getSampleProof` need it (`INVALID_INPUT` without it); settlement does not. |
| `MONAD_FACTORY_ADDRESS` | for missions | — | MissionFactory. `readMissionCreated` needs it. |
| `MONAD_RPC_URL` | no | `NEXT_PUBLIC_MONAD_RPC_URL` | JSON-RPC endpoint |
| `MONAD_CHAIN_ID` | no | `NEXT_PUBLIC_MONAD_CHAIN_ID`, else `10143` | |
| `MONAD_VAULT_DEPLOY_BLOCK` | no | `0` | First block for log scans (set it: public RPCs limit `eth_getLogs`) |
| `MONAD_TX_TIMEOUT_MS` | no | `60000` | Max wait per call for a receipt |
| `MONAD_TX_CONFIRMATIONS` | no | `1` | Blocks on top of the receipt block, the receipt block included |
| `MONAD_POLL_INTERVAL_MS` | no | `500` | |
| `MONAD_LEASE_MS` | no | `30000` | How long one instance may prepare a job before it records a tx |
| `MONAD_DROP_GRACE_MS` | no | `10000` | After this delay a tx that is unknown or stuck in the pool is repaired |
| `MONAD_LOG_CHUNK_BLOCKS` | no | `1000` | `eth_getLogs` range per request |

Monad testnet deployment (`contracts/deployments/monad-testnet.json`, commit 94765a5):
`MONAD_VAULT_ADDRESS=0xcc10787653F33fefA68a455bEe3daB964C22e0b3`, `MONAD_VAULT_DEPLOY_BLOCK=65855492`,
`MONAD_REGISTRY_ADDRESS=0x4e9D5E72c00e30be7A0431B6b69BF296362E99Ec`, `MONAD_FACTORY_ADDRESS=0xC462FbC4ae4D522C19714c9DeE4D6f4Ff03c4c73`.
The key of verifier `0xE83b…558B` goes in the server env only. Always take the addresses from the JSON or the env.
They are not hard-coded.

## API

| Function | Returns |
|---|---|
| `settleSubmission({ chainMissionId, contributorAddress, submissionHash })` | `{ txHash, amount, status: "settled" }`. Returns only after a **successful receipt** (plus the configured confirmations). `amount` is a wei string. `txHash` is `null` only if the chain shows the settlement but its `Settled` log is outside the scanned range. |
| `getSettlement({ chainMissionId, submissionHash })` | `{ status: "none" }` · `{ status: "pending", txHash? }` · `{ status: "settled", txHash?, amount }` |
| `getContributorBalance({ contributorAddress })` | `{ credited, withdrawn, withdrawable }` (wei strings) |
| `withdrawForContributor({ contributorAddress })` | `{ txHash, amount }`. The verifier pays the gas and the Vault sends the MON **only to the contributor**. |
| `listWithdrawals({ contributorAddress, fromBlock? })` | `[{ txHash, blockNumber, amount }]` from `Withdrawn` logs |
| `anchorDataset({ chainMissionId, merkleRoot, sampleCount, manifestHash })` | `{ txHash, status: "anchored" }` after a successful receipt. Idempotent. See the dataset anchor flow below. |
| `isSettlementPaused()` | `paused()` of the Vault. The UI should block "Create mission" while it is true (G4 L-2). |
| `resyncNonce()` | Ops only (key rotation, DB restore): set the stored nonce counter to the chain's pending nonce. |

Read helpers without a key (G6c, exported from `@/lib/monad`): `buildDatasetTree`, `getDataset`,
`getSampleProof`, `readMissionCreated`, `metadataHash`. Each takes an optional `MonadReader` (`createMonadReader(env)`).

Input rules: `contributorAddress` must be EIP-55 checksummed (all-lowercase or all-uppercase is accepted). It must
not be the zero address or the Vault (G4 L-1). `submissionHash` is `0x` + 64 hex and not zero. `chainMissionId` is a
positive integer given as a decimal string, a safe integer or a bigint. `TODO(F6)`: the hash is used as it is for now.
A salted commitment may replace it later, inside this folder only.

## Errors

Every failure throws a `MonadSettlementError` with `code`, a fixed `message`, and optionally `reason` and `txHash`.

| `code` | When | Tx sent? |
|---|---|---|
| `INVALID_INPUT` | Bad address, hash or id. The contributor is the Vault. The key was already used with another contributor. The contract reported `InvalidContributor`, `ZeroAddress`, `InvalidSubmission`, `InvalidRoot`, `InvalidMetadata` or `SampleCountMismatch`. `MONAD_REGISTRY_ADDRESS` missing (`REGISTRY_NOT_CONFIGURED`). | no |
| `MISSION_NOT_FOUND` | The mission does not exist on chain | no |
| `CONTRACT_PAUSED` | The Vault is paused, or the Registry for `anchorDataset` (`EnforcedPause`) | no |
| `INSUFFICIENT_FUNDS` | The verifier cannot pay `gas × maxFee` | no |
| `TX_REVERTED` | The simulation would revert (`reason` = contract error, e.g. `MissionNotActive`, `MissionNotEnded`, `AlreadyFinalized`, `NothingToWithdraw`, `VERIFIER_ROLE_MISSING`, `GAS_CAP_EXCEEDED`), or the mined tx reverted (`reason: REVERTED_ON_CHAIN` plus `txHash`) | only in the second case |
| `TX_TIMEOUT` | No receipt before `MONAD_TX_TIMEOUT_MS` (`txHash` is set). The job stays pending: **call again to keep waiting**, and no second tx is sent. | yes |
| `RPC_ERROR` | RPC or store failure, broadcast rejected (`BROADCAST_REJECTED`), nonce conflict, or a replaced tx that also failed its one retry (`TX_DROPPED`) | maybe |

`ALREADY_SETTLED` is **not** an error: the same `(chainMissionId, submissionHash)` returns the first result again.
Reverts are never retried automatically: on Monad a revert costs the whole gas limit.

## Safety on Monad

- Every call is simulated first (`eth_call`). Then the gas limit is set to `estimate × 1.15`, capped at **200k** for
  `approveSubmission`, **160k** for `withdrawFor` (G3b gas report, G4 phase 1) and **200k** for `anchorDataset`
  (max 149,939 in the same report). If the estimate itself is above
  the cap, nothing is sent.
- Pause, mission existence and on-chain settlement are checked before sending. The balance check covers
  `gas × maxFeePerGas`.
- Structured JSON log lines (`scope: "lib/monad"`) carry `event`, `chainMissionId`, `submissionHash`, `txHash`,
  `nonce`, `status`/`code`/`reason`, `durationMs`, `retry` and `idempotent`. They never contain a key, a raw tx or an
  RPC body.

## Mission create flow (Mission create akışı)

The buyer's wallet signs `MissionFactory.createMission(metadataHash, reward, targetCount)` from the frontend
(wagmi) and pays the budget. The backend sends nothing here. It only checks the result:

```ts
import { metadataHash, readMissionCreated } from "@/lib/monad";

// POST /api/missions  body: { txHash, title, description, requirements }
const expected = metadataHash({ title, description, requirements }); // sorted-key JSON → keccak256
const created = await readMissionCreated({ txHash });                // null → no receipt yet: ask the client to retry
if (!created) return Response.json({ code: "PENDING" }, { status: 202 });
if (created.metadataHash !== expected || created.buyer !== session.walletAddress) {
  return Response.json({ code: "MISMATCH" }, { status: 400 });
}
// missions.chain_mission_id = created.missionId (from the Factory event, never from the client body)
```

`readMissionCreated` accepts only a `MissionCreated` log emitted by `MONAD_FACTORY_ADDRESS` in a successful receipt.
The frontend must hash the same object with the same function (`metadataHash` is plain viem, no server secret).

## Dataset anchor flow (Dataset anchor akışı)

1. The mission ends on chain: `Completed` (target reached) or `Cancelled` (buyer). Only then the Registry accepts
   an anchor (`MissionNotEnded` otherwise).
2. `buildDatasetTree({ chainMissionId })` rebuilds the tree from the Vault's `Settled` events (not from the DB).
   Leaf = `keccak256(bytes.concat(keccak256(abi.encode(submissionHash))))`, sorted pairs, the same as OpenZeppelin
   `StandardMerkleTree.of(values, ["bytes32"])`. It throws when the log count differs from `acceptedCount`.
3. The backend writes the dataset manifest (for example `{ missionId, root, entries }`) and hashes it:
   `manifestHash = metadataHash(manifest)`.
4. `anchorDataset({ chainMissionId, merkleRoot: tree.root, sampleCount: tree.hashes.length, manifestHash })`
   with the verifier key → `{ txHash, status: "anchored" }` after a successful receipt.
5. The **buyer** reviews the root and calls `ProvenanceRegistry.finalizeDataset(missionId, reviewedRoot)` from the
   frontend. **The backend never calls finalize.** A re-anchor that lands first makes that call revert
   (`RootMismatch`), so the buyer never freezes a root they did not see.
6. Anyone can check a sample: `getSampleProof({ chainMissionId, submissionHash })` → `verified` is the answer of
   `verifySample` on chain (in the anchored root **and** settled in this mission).

```ts
// POST /api/missions/:id/dataset/anchor
const tree = await buildDatasetTree({ chainMissionId });
const manifestHash = metadataHash({ missionId: String(chainMissionId), root: tree.root, entries: tree.entries });
const { txHash } = await monad.anchorDataset({
  chainMissionId, merkleRoot: tree.root, sampleCount: tree.hashes.length, manifestHash,
});
```

`anchorDataset` rules (the same safety as settlement):
- **Idempotent.** The same root, `sampleCount` and `manifestHash` already on chain → success with no tx. `txHash`
  is the tx that set it (from the `DatasetAnchored` log), or `null` if that log is outside the scanned range.
  Identical calls running at the same time in one process share one tx.
- Read before sending, so a doomed tx is never paid for: Registry paused → `CONTRACT_PAUSED`; unknown mission →
  `MISSION_NOT_FOUND`; mission still active → `TX_REVERTED` / `MissionNotEnded`; `sampleCount` ≠ `acceptedCount` →
  `INVALID_INPUT` / `SampleCountMismatch`; finalized with another root → `TX_REVERTED` / `AlreadyFinalized`. Then
  simulate + gas cap (200k), the same signer nonce counter as `withdrawFor`, and the receipt wait of settlement.
- A different root or manifest re-anchors (the Registry allows it until the buyer finalizes).
- Two processes that anchor the same values at the same moment may both send; the second tx only re-writes the same
  values. This path has no idempotency row (the settlement table is keyed by submission), so avoid parallel anchor
  jobs for one mission, e.g. with a status column on `missions`.

## Idempotency and nonces (the store)

`SettlementStore` (`store/types.ts`) keeps one row per `(vault, chainMissionId, submissionHash)`:
the idempotency lock. `MemorySettlementStore` is for tests. `SupabaseSettlementStore` calls the Postgres functions
in **`sql/settlement.sql`**. Developer 3 adds that file as a migration under `supabase/`.

1. **Claim.** An atomic insert or takeover gives exactly one instance the job. Others wait for its tx hash, then
   wait for the same receipt.
2. **Reserve nonce.** The nonce comes from Postgres (`signer_nonces` row lock, `SELECT … FOR UPDATE`), is bound to
   the job, and is never below the chain's pending nonce.
3. **Record, then broadcast.** The tx hash and the signed raw tx are stored *before* sending. After a crash or a
   restart, any instance finds them and waits; it never sends a second tx.
4. **Receipt.** Success → `settled`. Revert → `failed` (a later call simulates again).

**Nonce gap strategy.** It uses both reuse of the same nonce and a resync to the chain:
- A definitive broadcast rejection puts the nonce on the signer's gap list. The next tx reuses it (lowest first).
- A job that reserved a nonce and died: once its lease expires, its nonce goes back to the gap list, or its own
  retry reuses it.
- A dropped tx is re-broadcast with the **same bytes** (same hash, same nonce), once.
- A replaced tx (its nonce was used by another tx) gets exactly **one** new attempt with a new nonce.
- The chain is ahead of the store (the key was used elsewhere): the counter moves up to the pending nonce.
- The store is ahead of the chain (chain reset, lost rows): once the counter has been idle for a lease, it comes
  down to `max(chain pending, highest nonce a live job holds + 1)`, and unused nonces become gaps.
- A tx stuck in the pool behind a missing nonce: the waiter re-broadcasts the raw tx of the job that holds that
  nonce. If no job holds it, the waiter fills it with a 0-value self-transfer (21k gas).

## Tests

```bash
cd contracts && forge build && cd ..        # the anvil tests deploy contracts/out
node --conditions=react-server --import ./lib/monad/test/register.mjs --test lib/monad/test/*.test.ts
npx tsc --noEmit
```

`register.mjs` resolves extensionless imports and maps `server-only` to Next's own empty module, so
`package.json` needs no change. Anvil must be on `PATH` or in `~/.foundry/bin` (or set `ANVIL_BIN`).
To run the SQL draft on a real Postgres, set `MONAD_TEST_PG_URL` and `MONAD_TEST_PG_MODULE` (the path to an
installed `pg`; see `test/pg.ts`). Add `MONAD_TEST_STORE=postgres` to run the anvil suites on it too.
