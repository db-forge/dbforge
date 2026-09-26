# TASK-MUI9MA0VRRVPS — G7 E2E preparation (zeki)

**Scope:** preparation phase only. Fork run done. **No broadcast was made and no private key was seen.** The real
testnet run is for the key holders ([E2E.md §3](../E2E.md)).

## 1. What was done

- `contracts/script/E2E.s.sol`: the full demo flow against the deployed addresses. Roles are separate broadcast
  addresses (`BUYER_ADDRESS`, `VERIFIER_ADDRESS`, optional `CONTRIBUTOR_ADDRESS`; the default is a new `makeAddr`
  address each run). The flow: preflight → createMission (2 × 0.01 MON) → approve h1 → replay h1 = `AlreadySettled`
  → approve h2 → `Completed` (+ replay = `MissionNotActive`) → withdrawFor → contributor +0.02 MON exactly →
  2-leaf OZ Merkle root → anchorDataset → verifySample (true/true/unknown false) → finalizeDataset(id, root).
  Every step logs its result and fails with `E2ECheckFailed("<step>")`.
- `contracts/docs/E2E.md`: the real-run command (keystores, `--slow`), the expected output, cost, and the
  explorer and `cast` checks.

**Deviation from the brief (on purpose):** the brief put "same hash again → AlreadySettled" after the two approvals.
In `MissionVault.approveSubmission` the status check comes **before** the replay key. After the second approval the
mission is `Completed`, so the replay reverts `MissionNotActive`, not `AlreadySettled`. The script therefore checks
the replay between the two approvals (→ `AlreadySettled`) and again after completion (→ `MissionNotActive`).
Both use `vm.prank` + try/catch and are **not broadcast**, because a reverted tx on Monad still pays gas.

## 2. Evidence

Fork run (`forge script script/E2E.s.sol --fork-url https://testnet-rpc.monad.xyz`, forge 1.8.3):

```
Script ran successfully.
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
Estimated total gas used for script: 1116925
Estimated amount required: 0.228969625 MON
```

Recorded transactions (`broadcast/E2E.s.sol/10143/dry-run/run-latest.json`): exactly 6, with the right senders. The
pranked replays are not in the list:

```
createMission(bytes32,uint256,uint256)      from 0x6bc9…f820 (buyer)    to Factory  value 0x470de4df820000 (0.02 MON)
approveSubmission(uint256,address,bytes32)  from 0xe83b…558b (verifier) to Vault    value 0x0
approveSubmission(uint256,address,bytes32)  from 0xe83b…558b (verifier) to Vault    value 0x0
withdrawFor(address)                        from 0x6bc9…f820 (buyer)    to Vault    value 0x0
anchorDataset(uint256,bytes32,uint256,bytes32) from 0xe83b…558b (verifier) to Registry value 0x0
finalizeDataset(uint256,bytes32)            from 0x6bc9…f820 (buyer)    to Registry value 0x0
```

Merkle cross-check with `@openzeppelin/merkle-tree@1` `StandardMerkleTree.of([[h1],[h2]], ["bytes32"])`, using the
hashes from the dry-run (an earlier fork run):

```
OZ root     0x26d70e7b113b353ff42ba4c38f2c54a03f134d76691ae00eebde00c7a1924641
anchored    0x26d70e7b113b353ff42ba4c38f2c54a03f134d76691ae00eebde00c7a1924641
match true
```

Negative preflight (the guards stop before any tx):

```
BUYER=admin (5 MON)       → Error: script failed: E2ECheckFailed("buyer would drop below the 10 MON reserve")
VERIFIER=admin (no role)  → Error: script failed: E2ECheckFailed("vault verifier role")
```

`forge fmt --check script/E2E.s.sol` → clean. The `cast call` / `cast balance` commands in E2E.md §4 were run
read-only against the live testnet and decode correctly (live buyer balance 39.9957 MON).

## 3. Changed files

- `contracts/script/E2E.s.sol` (new)
- `contracts/docs/E2E.md` (new)
- `contracts/docs/agent-results/TASK-MUI9MA0VRRVPS-zeki.md` (this report; not in the commit, because the brief limits
  the commit to the two files above)

## 4. Risks

- **Multi-sender ordering:** without `--slow`, forge can send the verifier's approve before the buyer's
  createMission is mined, and the approve reverts. E2E.md makes `--slow` required.
- **missionId race:** the missionId is fixed in the simulation. If another mission is created between the simulation
  and the broadcast, the verifier's txs revert with `MissionNotActive`. The fix is to run the script again. This is
  unlikely on testnet.
- **Two keys in one process:** the buyer (MetaMask) and verifier (backend) keys must both be available to one
  `forge script` run, through keystores or `--interactives 2`. If the verifier key must never leave the backend,
  the run must happen on the backend machine.
- The in-script asserts run only in the simulation. On-chain results are checked with the receipt status and E2E.md §4.

## 5. Open questions

- Who runs the real broadcast, and on which machine (because of the verifier key location)?

## 6. Next step

The key holders run E2E.md §3 (fork → `--broadcast --slow`), then paste the logs and 6 tx hashes. QA then checks
them against §4 and moves the card to done.

## Platform

Verified on **Windows 11** (Git Bash, forge 1.8.3). The script is Solidity with no platform-dependent code. The
commands in E2E.md are POSIX shell (`export`, `$RPC`), so they are the same on mac/Linux; in PowerShell use
`$env:BUYER_ADDRESS=…`. Keystores are in `~/.foundry/keystores` on every OS. **mac/Linux not run** (no machine in
this session); nothing in the code path depends on the platform.
