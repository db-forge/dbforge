# TASK-MUIEDSRAVCQIS (G6c): lib/monad read side (vera)

Branch `feat/contracts`, parallel to Nil (G6b). Nil's files (`config.ts`, `chain.ts`, `abi.ts`, `errors.ts`,
`validation.ts`, `index.ts`, `test/anvil.ts`, `test/register.mjs`) are **imported only, not changed**.
`index.ts` is not touched: the new functions are not exported from `@/lib/monad` yet (see "Next step").

## 1. What was done

| File | Content |
|---|---|
| `lib/monad/merkle.ts` | `datasetLeaf(hash)`, `buildTreeFromHashes(hashes)` (OZ `StandardMerkleTree.of(…, ["bytes32"])` algorithm, sortLeaves), `buildDatasetTree({ chainMissionId })`: leaves come **only from the chain**, from the Vault's `Settled(missionId, …)` events (chunked forward scan). It throws when the log count ≠ `getMission.acceptedCount`, so a missed scan never produces a wrong root. It rejects an empty list and duplicates. It returns `{ root, hashes, getProof, entries[] }`; `entries` holds the submissionHash, contributor, amount, txHash and block for the manifest. |
| `lib/monad/mission.ts` | `metadataHash(obj)` = keccak256(UTF-8 sorted-key JSON), ARCHITECTURE §8. It rejects `undefined`, bigint, NaN, Date and functions (it does not silently drop them). `canonicalJson` is exported. `readMissionCreated({ txHash })` → `{ missionId, buyer, rewardPerSubmission, targetCount, metadataHash, txHash, blockNumber }`. It returns `null` when there is no receipt yet. A reverted tx → `TX_REVERTED/REVERTED_ON_CHAIN`. Only a `MissionCreated` log **emitted by our Factory address** counts (a look-alike event from another contract → `INVALID_INPUT/NO_MISSION_CREATED_EVENT`). |
| `lib/monad/dataset.ts` | `getDataset({ chainMissionId })` → `{status:"none"}` or `{status:"anchored", merkleRoot, metadataHash, sampleCount, anchoredAt, finalized}`. `getSampleProof({ chainMissionId, submissionHash })` rebuilds the tree from the chain, then asks **`ProvenanceRegistry.verifySample`** itself. It returns `{included:false}` or `{included:true, root, proof, anchoredRoot, verified}`. |
| `lib/monad/reader.ts` (new, mine) | Read-only context (`MonadReader`, no key). It reuses Nil's `loadConfigFromEnv` and adds the env `MONAD_FACTORY_ADDRESS` and `MONAD_REGISTRY_ADDRESS`. When a function needs one of these and it is missing → `INVALID_INPUT/READER_NOT_CONFIGURED`. The ABI fragments are here as `parseAbi` (`abi.ts` is not changed). Errors go through Nil's `mapChainError`, so no raw RPC text leaks. |

Every function takes the reader as an optional second parameter. By default it builds one reader from `process.env`
(`defaultReader()`), so calls match the brief's signatures, e.g. `readMissionCreated({ txHash })`.

## 2. Evidence

**New tests** (`node --conditions=react-server --import ./lib/monad/test/register.mjs --test lib/monad/test/merkle.test.ts lib/monad/test/mission.test.ts`):
```
▶ merkle (unit)
  ✔ matches the Solidity/OpenZeppelin fixture: root and every proof
  ✔ root does not depend on input order or hash case
  ✔ single leaf: root is the leaf, proof is empty
  ✔ every proof of a larger odd-sized tree folds back to the root
  ✔ rejects empty, duplicate and malformed input; unknown hash has no proof
▶ merkle + dataset on anvil (integration)
  ✔ buildDatasetTree reads Settled events and reproduces the fixture root (chunked scan)
  ✔ getDataset before anchor is none; getSampleProof reports not verified
  ✔ anchored root verifies every proof on chain (verifySample)
  ✔ finalized flag is reported after the buyer finalizes
  ✔ a scan that misses logs fails loudly instead of returning a wrong root
  ✔ unknown mission → MISSION_NOT_FOUND; registry missing → READER_NOT_CONFIGURED
▶ metadataHash (unit)  ✔ ×3
▶ readMissionCreated on anvil (integration)
  ✔ returns the missionId and fields of a createMission tx
  ✔ unknown tx → null (not mined yet); malformed hash → INVALID_TX_HASH
  ✔ a tx without a MissionCreated from OUR factory is rejected
ℹ tests 17  ℹ pass 17  ℹ fail 0
```
- Fixture equality: `buildTreeFromHashes([_sub(0),_sub(1),_sub(2)]).root ==
  0x606f8985…87be`, the same as `jsRoot` in `ProvenanceRegistry.t.sol`. The three proofs are byte-for-byte equal to the fixture.
- Anvil e2e: a real mission (target 3) → 3 `approveSubmission` → `buildDatasetTree` (logChunkSize=5, several
  chunks) gives the same root → the verifier `anchorDataset`s it → `verifySample` returns **true** for every proof. After
  `finalizeDataset`, `finalized: true`.

**Full lib/monad suite** (Nil's tests included, regression check): `ℹ tests 65 · pass 64 · fail 0 · skipped 1`
(the skipped one is the postgres store: "set MONAD_TEST_PG_URL and MONAD_TEST_PG_MODULE").

**Typecheck:** `npx tsc --noEmit -p .` → no output (clean).

**Live Monad testnet read smoke test** (deploy addresses from `contracts/deployments/monad-testnet.json`, reads only):
```
chainId 10143
getDataset(1) {"status":"none"}
setFactory tx → {"code":"INVALID_INPUT","message":"Invalid input. Expected one MissionCreated from the Factory, found 0.","reason":"NO_MISSION_CREATED_EVENT"}
unknown tx → null
```
(The temporary smoke script was deleted and is not in the repo.)

## 3. Changed files
Commits: code in `351daea` (the lead's time-boxed hand-off commit; files identical to mine), report in the follow-up `docs(monad)` commit. No push.
- `lib/monad/merkle.ts`, `lib/monad/mission.ts`, `lib/monad/dataset.ts`, `lib/monad/reader.ts` (new)
- `lib/monad/test/merkle.test.ts`, `lib/monad/test/mission.test.ts` (new)
- This report

## 4. Risks
- **Log scan cost:** `buildDatasetTree` scans from `MONAD_VAULT_DEPLOY_BLOCK` to latest in `MONAD_LOG_CHUNK_BLOCKS`
  ranges. On testnet the chain moves fast, so the number of requests grows over time. The count guard stops a wrong root,
  but the scan gets slow. Later: cache or index per mission (a DB `Settled` index).
- **Duplicate ABI:** `reader.ts` has its own `parseAbi` fragments (because `abi.ts` belongs to Nil). If Nil adds a Registry
  ABI in G6b, they should be merged later. The Solidity event and function signatures are fixed in ARCHITECTURE §5–6.
- **`metadataHash` canonical form:** this is sorted-key `JSON.stringify` (not full RFC 8785 JCS). The number format
  follows JS. Fine for the MVP (`title/description/requirements` are strings). Dev 3 must use **this function**
  when writing `missions.metadata_hash`, not a hash of their own.
- `readMissionCreated` does not wait for confirmations: it relies on Monad's ~1-slot finality. The caller calls again on `null`.

## 5. Open questions
- The G6b card text (items 1, 3, 4) could not be read through the board tool (`list_tasks` has no description, and the
  AgentSpace cache file was locked). I worked from the brief + ARCHITECTURE.md §5/§8 + the Solidity fixture.
  If the G6b card asks for a different signature or name, please report it.
- Env names: `MONAD_FACTORY_ADDRESS`, `MONAD_REGISTRY_ADDRESS`. If Nil uses a different name for the Registry
  in `anchorDataset`, one of the two should be aligned.

## 6. Next step
- Nil / leader: export `buildDatasetTree`, `readMissionCreated`, `metadataHash`, `getDataset`, `getSampleProof`
  and `createMonadReader` from `index.ts` (it was not touched per the scope rule). Nil's `anchorDataset` can use
  `buildDatasetTree(...)` for `root` + `hashes.length`.
- Add a README "read side" section (Nil owns the README).

**PLATFORM STATEMENT:** Verified on **Windows** (Windows 11, Node 24.15, anvil from `~/.foundry/bin/anvil.exe`).
The code added here has no platform-specific path: no process, file path or shell use, only viem HTTP reads.
The anvil binary lookup (`anvil.exe` / `anvil`) is Nil's harness and is not changed. **mac / Linux: not run**
(no machine in this session). Nothing in the code depends on the platform.
