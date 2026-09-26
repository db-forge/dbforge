# TASK-MUIE83VXTDYYN (G6b): anchorDataset + G6c exports + README flows (nil)

Commit: `2d9fc10` on `feat/contracts` (not pushed). Scope: `lib/monad/` only.

## 1. What was done

The card's scope was narrowed by the lead: vera wrote items 1, 3, 4 and 5 (`merkle.ts`, `mission.ts`, `dataset.ts`,
`reader.ts`, G6c = TASK-MUIEDSRAVCQIS, commit 35cd96f). I did not write those files. I import and export them.
My items are 2, 6 and 7:

- **`SettlementAdapter.anchorDataset({ chainMissionId, merkleRoot, sampleCount, manifestHash })`**
  → `{ txHash, status: "anchored" }`. It uses the G6 infrastructure: the verifier key, the signer nonce counter in
  the store (`allocateNonce`, the same path as `withdrawFor`), `waitForTx` (receipt + confirmations, drop
  re-broadcast, replacement detection, hole repair), and the typed errors. The order is:
  1. **Read first.** `getDataset`: same root + sampleCount + manifest already anchored → success, **no tx**; `txHash`
     comes from the `DatasetAnchored` log (null if that log is out of the scan range). Finalized with another root
     → `TX_REVERTED`/`AlreadyFinalized`, not sent.
  2. Registry `paused()` → `CONTRACT_PAUSED` (not sent). Mission `None` → `MISSION_NOT_FOUND`. Mission still
     `Active` → `TX_REVERTED`/`MissionNotEnded` (not sent). `sampleCount ≠ acceptedCount` →
     `INVALID_INPUT`/`SampleCountMismatch` (not sent).
  3. Simulate → estimate × 1.15 → **cap 200k** (forge gas report, `network = "monad"`: anchorDataset max 149,939)
     → balance check → sign → broadcast → receipt `success` → return.
  4. Replaced tx → reads the chain again (an identical anchor elsewhere = success), else `RPC_ERROR`/`TX_DROPPED`.
  5. Identical calls running at the same time in one process share one promise, so they send one tx.
- **Error mappings** (`chain.ts` `mapChainError`): `InvalidRoot`, `InvalidMetadata`, `SampleCountMismatch` →
  `INVALID_INPUT`. `MissionNotEnded`, `AlreadyFinalized` → `TX_REVERTED` with that `reason`. `EnforcedPause` →
  `CONTRACT_PAUSED`. Zero root, zero manifest hash and count 0 are rejected locally before any RPC.
- `chain.ts`: each call goes to its contract (`anchorDataset` → Registry, the rest → Vault; `PreparedTx.to`). New
  reads: `getMission` (status + acceptedCount), `isRegistryPaused`, `getDataset`, `findDatasetAnchoredTx`
  (`merkleRoot` is **not indexed** in `DatasetAnchored`, so the logs are filtered by missionId on the node and by
  root + manifest in code).
- `abi.ts`: `provenanceRegistryAbi` subset + `GAS_CAP.anchorDataset`. `config.ts`: optional `MONAD_REGISTRY_ADDRESS`
  (the same variable vera's reader uses). Settlement works without it. `validation.ts`: `parseBytes32` and
  `parsePositiveUint` (the old parsers now call these). `withdrawFor` and `anchorDataset` share one private
  send loop (`sendUnkeyed`). The behaviour of `withdrawFor` did not change, and all its tests pass.
- **`index.ts`**: exports `anchorDataset` types plus vera's `buildDatasetTree`, `buildTreeFromHashes`, `datasetLeaf`,
  `readMissionCreated`, `metadataHash`, `canonicalJson`, `getDataset`, `getSampleProof`, `createMonadReader` and
  their types.
- **README**: env rows (`MONAD_REGISTRY_ADDRESS`, `MONAD_FACTORY_ADDRESS`, testnet values), API row, error table,
  caps, new sections **"Mission create flow (Mission create akışı)"** (buyer signs → backend `readMissionCreated(txHash)`
  + compares `metadataHash`) and **"Dataset anchor flow (Dataset anchor akışı)"** (Completed/Cancelled →
  buildDatasetTree → manifest hash → anchorDataset → the buyer calls `finalizeDataset(missionId, reviewedRoot)` from
  the frontend; **the backend never calls finalize**).

## 2. Evidence

`npx tsc --noEmit -p .` (whole repo, after the G6c and G9 commits landed):
```
TSC_EXIT=0
```

`node --conditions=react-server --import ./lib/monad/test/register.mjs --test lib/monad/test/*.test.ts`, the full
lib/monad suite on a private anvil. G6b tests:
```
✔ create → readMissionCreated → 2 settles → buildDatasetTree → anchorDataset → verifySample → repeat sends no tx (990.7433ms)
✔ rejections before sending: active mission, wrong sampleCount, unknown mission, bad input — nonce unchanged
✔ paused Registry → CONTRACT_PAUSED, not sent; unpause → anchors (409.0126ms)
✔ re-anchor until finalized; after finalize: same root → success, another root → AlreadyFinalized, not sent (465.1072ms)
✔ identical concurrent calls in one process share one tx
✔ MONAD_REGISTRY_ADDRESS not configured → INVALID_INPUT REGISTRY_NOT_CONFIGURED; settlement still works
✔ G6b: registry ABI matches the ProvenanceRegistry artifact (3.635ms)
✔ G6b: registry reverts map to typed errors; config reads MONAD_REGISTRY_ADDRESS; bytes32/uint parsers (3.7198ms)
ℹ tests 73
ℹ pass 72
ℹ fail 0
ℹ skipped 1        ← store.postgres.test.ts, gated by MONAD_TEST_PG_URL (G6, unchanged)
```
What the E2E test checks: the `readMissionCreated` result (buyer, metadataHash, targetCount), that the tree hashes
equal the two settled hashes, `verified: false` before the anchor, a receipt with `status: success` whose `to` is
the Registry and whose gasUsed is under 200k, `verified: true` from `verifySample` for both hashes, and then the
repeat call: the same result object and **the verifier nonce unchanged**.

Mutation check (the test must fail when the code is wrong): I replaced the read-first step with `null` and ran
`anvil.anchor.test.ts` → `✖ create → … repeat sends no tx` and `✖ re-anchor until finalized …`. Then I restored
the file, and the tests pass again (above).

No regression in the G9 client suite (`lib/monad/client/test`, kaan): `tests 13, pass 13, fail 0`.

Gas source: `forge test --gas-report --match-contract Provenance` → `anchorDataset | 31114 | 106267 | 141957 | 149939 | 38`.

## 3. Changed files (2d9fc10)

`lib/monad/{README.md, abi.ts, adapter.ts, chain.ts, config.ts, index.ts, log.ts, validation.ts}`,
`lib/monad/test/{anvil.anchor.test.ts (new), anvil.ts (+deployRegistry), helpers.ts (+registry option), unit.test.ts}`.
I did not edit vera's files (`merkle.ts`, `mission.ts`, `dataset.ts`, `reader.ts`, their tests) or `client/`.

## 4. Risks

- **Anchors have no idempotency row in the store.** The settlement table is keyed by submission. So two processes
  (or a retry after `TX_TIMEOUT` while the first tx is still in the pool) can send two identical anchors. The second
  tx only writes the same values again and costs gas; the result is still correct. Inside one process, identical
  calls are deduplicated. README advice: make the anchor job single-flight per mission (for example a status column
  on `missions`).
- The idempotent return's `txHash` comes from a backwards log scan starting at `MONAD_VAULT_DEPLOY_BLOCK`. The
  Registry was deployed after the Vault in the same deployment, so this block covers it. On a very long chain the
  scan can take several `eth_getLogs` calls (chunk = `MONAD_LOG_CHUNK_BLOCKS`).
- `CONTRACT_PAUSED` keeps its shared fixed message ("Settlement is paused on chain."). The anchor adds the detail
  "Dataset anchoring is paused. Not sent."

## 5. Open questions

- For Developer 3: `.env.example` needs `MONAD_REGISTRY_ADDRESS=0x4e9D5E72c00e30be7A0431B6b69BF296362E99Ec` and
  `MONAD_FACTORY_ADDRESS=0xC462FbC4ae4D522C19714c9DeE4D6f4Ff03c4c73`. That file is not mine, so I did not edit it.
- Should the manifest format (what goes into `manifestHash`) be fixed in ARCHITECTURE.md? The README example uses
  `{ missionId, root, entries }`. The lead decides.

## 6. Next step

The lead verifies and pushes. Developer 3 wires `POST /api/missions/:id/dataset/anchor` (the flow in the README).
A live testnet anchor needs a mission that has ended; it was not run here, because it would spend testnet MON from
the verifier key, and that key is not in this environment.

**Platform:** verified on **Windows 11** (Node 24, anvil from Foundry in `~/.foundry/bin`). The code path has no
platform-specific part: it is plain viem HTTP JSON-RPC with no files, processes or shell. The only platform branch
is in the test harness: `anvil.exe` vs `anvil` (`test/anvil.ts`, from G6), so the same tests should run on
macOS/Linux with Foundry installed. I **could not run** them on mac/Linux because no such machine is available here.
