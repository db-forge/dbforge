# End-to-end run on Monad Testnet

Script: [`script/E2E.s.sol`](../script/E2E.s.sol). It runs the full demo flow against the **deployed** contracts
(`deployments/monad-testnet.json`). Run everything from `contracts/` in Git Bash with
`export PATH="$PATH:$HOME/.foundry/bin"`.

## What the script does

| Step | Signer | Call | Check |
|---|---|---|---|
| 0 | — | preflight | chain 10143, verifier has `VERIFIER_ROLE` on Vault and Registry, nothing paused, buyer ≥ 10 MON reserve + 0.02 + 1 MON gas, contributor is an EOA with nothing withdrawable |
| 1 | buyer | `Factory.createMission{value: 0.02 MON}(meta, 0.01 MON, 2)` | status `Active` |
| 2 | verifier | `Vault.approveSubmission(id, contributor, h1)` | — |
| 3 | *(simulated only)* | replay `h1` | reverts `AlreadySettled(id, h1)` |
| 4 | verifier | `Vault.approveSubmission(id, contributor, h2)` | — |
| 5 | *(simulated only)* | status, counters, replay `h1` | `Completed`, `acceptedCount 2`, `remainingBudget 0`, replay reverts `MissionNotActive(id)` |
| 6 | buyer | `Vault.withdrawFor(contributor)` | contributor balance **+0.02 MON exactly**, withdrawable 0 |
| 7 | — | Merkle root of `[h1, h2]` | OZ `StandardMerkleTree.of(values, ["bytes32"])` format |
| 8 | verifier | `Registry.anchorDataset(id, root, 2, datasetMeta)` | — |
| 9 | *(view)* | `verifySample` | `h1` true, `h2` true, unknown hash false |
| 10 | buyer | `Registry.finalizeDataset(id, root)` | `finalized == true`, buyer still ≥ 10 MON |

**Why the replay runs between the two approvals:** `approveSubmission` checks the mission status before the
replay key. After the second approval the mission is `Completed`, so a replay then reverts `MissionNotActive`,
not `AlreadySettled`. Step 3 proves the replay key; step 5 proves a completed mission refuses any settlement.

The replay checks use `vm.prank` and are **never broadcast**. A reverted tx on Monad still pays gas.

**Real transactions: 6.** 3 from the buyer (create, withdrawFor, finalize) and 3 from the verifier (approve ×2, anchor).
Value sent: 0.02 MON (buyer → Vault → contributor).

## 1. Addresses

```sh
export BUYER_ADDRESS=0x6bC9D417B0D47458F51d9D2AA41D5DA41005F820
export VERIFIER_ADDRESS=0xE83b50CA5b1b0D281789a1FD13976C449D22558B
# optional; without it the script derives a new empty address each run (makeAddr + timestamp)
# export CONTRIBUTOR_ADDRESS=0x...   # must be an EOA with 0 withdrawable in the Vault
```

The contributor never signs. The buyer pays the gas for `withdrawFor`, so the contributor needs 0 MON.

## 2. Fork run (no keys, no broadcast)

```sh
forge script script/E2E.s.sol --fork-url https://testnet-rpc.monad.xyz
```

Expected output (the addresses, hashes and missionId change each run):

```
== Logs ==
  chainId     10143
  buyer       0x6bC9D417B0D47458F51d9D2AA41D5DA41005F820 39995718520000000000
  verifier    0xE83b50CA5b1b0D281789a1FD13976C449D22558B 5000000000000000000
  contributor 0xbDD2Aed9a0340d761a08d53B040dFb3B27D47B13 0
  [1] createMission ok, missionId 1
  [2] approveSubmission h1 ok
  [3] replay h1 -> AlreadySettled (as expected)
  [4] approveSubmission h2 ok
  [5] status Completed, acceptedCount 2, replay after completion -> MissionNotActive
  [6] withdrawFor ok, contributor gained wei 20000000000000000
  [7] merkle root
  0xf8ea52782ad3ad33065e9e673f65bf6375e4407f7b582d78a6d9f344b94a4b20
  [8] anchorDataset ok
  [9] verifySample h1 true, h2 true, unknown false
  [10] finalizeDataset ok
  buyer balance after (wei) 39975718520000000000
  E2E PASS  missionId 1 contributor 0xbDD2Aed9a0340d761a08d53B040dFb3B27D47B13
...
Estimated total gas used for script: 1116925
Estimated amount required: 0.228969625 MON
```

Any failed check stops the script with `E2ECheckFailed("<step>")`, and nothing is sent.

## 3. Real run (the key holders run it; the keys never leave their keystores)

Both signing keys must be available to **one** `forge script` process. Each key holder imports their key once
into an encrypted Foundry keystore on the machine that runs the script. The key is typed at a hidden prompt
and is never printed or written in plain text:

```sh
cast wallet import dbforge-buyer --interactive      # buyer key (for example exported from MetaMask)
cast wallet import dbforge-verifier --interactive   # verifier key (the backend key holder)
cast wallet address --account dbforge-buyer         # must print BUYER_ADDRESS
cast wallet address --account dbforge-verifier      # must print VERIFIER_ADDRESS
```

If the verifier key must stay on the backend machine, run the script **there** with both keystores, or use
`--interactives 2` (asks for the two private keys at hidden prompts, stores nothing).

Run the fork command from step 2 first. It must print `E2E PASS`. Then:

```sh
forge script script/E2E.s.sol --rpc-url https://testnet-rpc.monad.xyz \
  --account dbforge-buyer --account dbforge-verifier --broadcast --slow
```

- It asks for each keystore password.
- **`--slow` is required.** The txs come from two senders, and each one depends on the previous one
  (for example the verifier's approve needs the buyer's mission). `--slow` sends one tx only after the previous one
  has a receipt.
- The missionId is fixed during the simulation (`nextMissionId`). If someone else creates a mission between the
  simulation and the broadcast, the verifier's txs revert with `MissionNotActive`. In that case, run the script again.
  It creates a new mission.
- Cost: about 0.23 MON of gas in total (Monad charges on the **gas limit**), plus the 0.02 MON reward. The buyer has
  about 40 MON and keeps well over 10 MON.

Tx hashes are written to `broadcast/E2E.s.sol/10143/run-latest.json` (git-ignored). Paste the `== Logs ==` block
and the 6 hashes to the lead:

```sh
node -e 'for (const r of require("./broadcast/E2E.s.sol/10143/run-latest.json").receipts) console.log(r.status, r.transactionHash)'
```

Every line must start with `0x1` (success).

## 4. Check on the explorer (MonadVision)

Explorer: `https://testnet.monadvision.com`

| What | Link | Expect |
|---|---|---|
| Each tx | `/tx/<hash>` | Status **Success**. From = buyer or verifier, as in the step table |
| createMission | `/tx/<hash>` | Value 0.02 MON to the Factory `0xC462…4c73`; events `MissionFunded` (Vault) + `MissionCreated` (Factory) |
| approve ×2 | `/tx/<hash>` | `Settled` event (missionId, hash, contributor, 0.01 MON); the second also has `MissionCompleted(id, 2)` |
| withdrawFor | `/tx/<hash>` | `Withdrawn(contributor, 0.02 MON)`; internal tx 0.02 MON Vault → contributor |
| Contributor | `/address/<contributor>` | Balance 0.02 MON (a fresh address) |
| anchorDataset | `/tx/<hash>` | `DatasetAnchored` with the root from the `[7]` log line and sampleCount 2 |
| finalizeDataset | `/tx/<hash>` | `DatasetFinalized(id, buyer)` |
| Contracts | `/address/0xcc10787653F33fefA68a455bEe3daB964C22e0b3` (Vault), `/address/0x4e9D5E72c00e30be7A0431B6b69BF296362E99Ec` (Registry) | The new txs appear in the list |

The same checks from the terminal (replace `<ID>`, `<ROOT>`, `<C>`):

```sh
RPC=https://testnet-rpc.monad.xyz
cast call 0xcc10787653F33fefA68a455bEe3daB964C22e0b3 "getMission(uint256)((address,uint256,uint256,uint256,uint256,bytes32,uint8))" <ID> --rpc-url $RPC
# status (last field) = 2 (Completed), acceptedCount = 2, remainingBudget = 0
cast balance <C> --rpc-url $RPC --ether                       # 0.020000000000000000
cast call 0x4e9D5E72c00e30be7A0431B6b69BF296362E99Ec "getDataset(uint256)((bytes32,bytes32,uint256,uint64,bool))" <ID> --rpc-url $RPC
# merkleRoot = <ROOT>, finalized = true
cast balance 0x6bC9D417B0D47458F51d9D2AA41D5DA41005F820 --rpc-url $RPC --ether   # > 10
```

## Merkle format

Leaf = `keccak256(bytes.concat(keccak256(abi.encode(submissionHash))))`, pair = keccak of the sorted pair.
This is the same as `@openzeppelin/merkle-tree` `StandardMerkleTree.of(hashes.map(h => [h]), ["bytes32"])`.
The fork run was checked against that library: same root, and each proof is the sibling leaf.
