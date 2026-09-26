# TASK-MUIC0XQBDHD64 (G3b) — Contract v2 · nil

Branch `feat/contracts`, base `72ab7a8`. Spec: `contracts/docs/ARCHITECTURE.md` v2 (not edited).
Scope: `contracts/` only. No deploy, no private key, no push.

## 1. What was done

Implemented every row of the ARCHITECTURE.md v2 change table. Tests came first: the v2 tests were written against
the v2 interfaces and failed to build on the v1 sources (RED, see §2), then the contracts were changed (GREEN).

| # (v2 table) | Change | Where |
|---|---|---|
| 1 | **Pull payments.** `approveSubmission` makes no external call. It writes the settlement and `credited[c] += reward`. `withdraw()` sends the whole withdrawable amount to `msg.sender` with all gas forwarded. `withdrawFor(c)` can be called by anyone, sends only to `c`, and forwards `WITHDRAW_FOR_GAS = 50_000`. Both use an assembly `call` that never copies returndata, and both are `nonReentrant`. | `MissionVault.sol` |
| 2 | **Replay key `(missionId, submissionHash)`.** `settlements[missionId][hash]` replaces the global `submissionPaid`. `AlreadySettled(missionId, hash)` replaces `AlreadyPaid`. | `MissionVault.sol`, `Errors.sol` |
| 3 | **Pausable + `PAUSER_ROLE`** on the Vault and the Registry. `pause()` needs PAUSER. `unpause()` needs DEFAULT_ADMIN. `approveSubmission` and `anchorDataset` are `whenNotPaused`. `cancelMission`, `withdraw`, `withdrawFor`, `registerMission`, `finalizeDataset` and `verifySample` stay open while paused. | both |
| 4 | Events `Settled(missionId idx, submissionHash idx, contributor idx, amount)` and `Withdrawn(contributor idx, amount)`. `SubmissionApproved` is removed. Views `getSettlement`, `getContributorBalance`, and public `credited` / `withdrawn`. | `IMissionVault.sol` |
| 5 | **Re-anchor until finalize.** `AlreadyAnchored` is removed. A finalized dataset reverts `AlreadyFinalized`. `DatasetAnchored` now carries `previousRoot` (0 on the first anchor). `anchoredAt` is the time of the latest anchor. | `ProvenanceRegistry.sol` |
| 6 | **`setFactory` → `InvalidFactory`** when the target has no code, when `vault()` is missing or reverts, when the return is not 32 bytes, or when it is not this Vault. The return is decoded as `uint256`, so dirty upper bits also give `InvalidFactory` and never a panic. | `MissionVault.sol` |
| 7 | **Invariants 1–6** from §3. The handler now covers settle, withdraw, withdrawFor, cancel, pause/unpause and forced MON through `selfdestruct`. One contributor is a contract that rejects MON. | `test/invariant/` |
| — | `verifySample` means "in the root **and** `vault.getSettlement(missionId, hash).settled`", so the settlement must be in *this* mission. | `ProvenanceRegistry.sol` |
| — | Fork test now covers the v2 flow: create → settle → `withdrawFor` → anchor → re-anchor → verify → finalize, and pause → cancel + withdraw. `forge snapshot` → `contracts/.gas-snapshot`. README updated. | `test/Fork.t.sol`, README |

Implementation choices the spec does not fix. **None of them changes the interface:**
- Both constructors give the admin `PAUSER_ROLE`, in addition to `DEFAULT_ADMIN_ROLE`. This way the brake works
  from the first block, and it matches §2 ("PAUSER_ROLE: Admin + guardian"). The deploy script (G5, WALLETS.md)
  may grant it again: that is a no-op.
- `approveSubmission` is no longer `nonReentrant`, because it makes no external call. The guard stays on
  `withdraw`, `withdrawFor` and `cancelMission`.
- `getContributorBalance` has unnamed return values in the implementation. Naming them `credited`/`withdrawn` would
  shadow the state variables and raise compiler warnings. **G6:** viem returns the positional tuple
  `[credited, withdrawn, withdrawable]`. The order is the one in §3.
- `registerMission` stays open while paused. Funding moves MON into the Vault, never out, and §3 says it is unchanged.

## 2. Evidence

Foundry `forge Version: 1.8.3`, solc 0.8.28, `network = "monad"`.

**RED** (v2 tests against the v1 sources):
```
$ forge build
Error: Compiler run failed:
Error (2904): Declaration "AlreadyPaid" not found in "src/Errors.sol" (referenced as "./Errors.sol").
```

**fmt / build**
```
$ forge fmt --check && echo "FMT OK"
FMT OK
$ forge build --force
Compiling 44 files with Solc 0.8.28
Compiler run successful with warnings:     # only: selfdestruct deprecation in test/utils/Mocks.sol (ForceSender, on purpose)
```

**test -vv**
```
Ran 34 tests for test/ProvenanceRegistry.t.sol:ProvenanceRegistryTest   ok. 34 passed; 0 failed
Ran 25 tests for test/MissionVaultWithdraw.t.sol:MissionVaultWithdrawTest ok. 25 passed; 0 failed
Ran 7 tests  for test/MissionFactory.t.sol:MissionFactoryTest           ok. 7 passed; 0 failed
Ran 52 tests for test/MissionVault.t.sol:MissionVaultTest               ok. 52 passed; 0 failed
Ran 1 test   for test/invariant/VaultInvariant.t.sol:VaultInvariantTest ok. 1 passed (6 invariants, all [PASS])
Ran 2 tests  for test/Fork.t.sol:MonadForkTest                          0 passed; 2 skipped (no fork)
Ran 6 test suites in 27.90s: 119 tests passed, 0 failed, 2 skipped (121 total tests)

[PASS] invariant_acceptedWithinTargetAndBudgetConsistent
[PASS] invariant_balanceCoversObligations
[PASS] invariant_conservation
[PASS] invariant_endedMissionsNeverSettle
[PASS] invariant_pairSettledAtMostOnce
[PASS] invariant_withdrawnNeverExceedsCredited
 VaultInvariantTest invariants (runs: 256, calls: 16384, reverts: 0)
coverage run, calls per selector: approve 2705 · cancel 2718 · createMission 2746 · forceSend 2781 · togglePause 2712 · withdraw 2722
```
The invariant run only calls the six action selectors (`targetSelector`). Without this, the handler's public getters
diluted the call sequence: an earlier run had one settlement in its last sequence.

Gas logs from the tests (Monad pricing):
```
approve gas, EOA contributor: 135435
approve gas, gas-burning contract contributor: 135435      # F1: settlement gas does not depend on the contributor
withdrawFor gas, 1MB returned: 104954
withdrawFor gas, 0B returned: 104963                        # returndata not copied
withdrawFor gas, hungry receiver (reverted): 141096         # bounded by the 50k stipend; the credit is kept
```

**coverage** (`forge coverage --report summary --no-match-coverage "(test|script)/"`)
```
| src/MissionFactory.sol     | 100.00% (6/6)     | 100.00% (5/5)     | 100.00% (1/1)   | 100.00% (2/2)   |
| src/MissionVault.sol       | 100.00% (76/76)   | 100.00% (92/92)   | 100.00% (21/21) | 100.00% (14/14) |
| src/ProvenanceRegistry.sol | 100.00% (40/40)   | 100.00% (48/48)   | 100.00% (10/10) | 100.00% (7/7)   |
| Total                      | 100.00% (122/122) | 100.00% (145/145) | 100.00% (32/32) | 100.00% (23/23) |
```

**Monad testnet fork** (`forge test --fork-url https://testnet-rpc.monad.xyz --match-contract Fork -vv`)
```
[PASS] test_fork_createSettleWithdrawAnchorFinalize() (gas: 1059035)
  fork block: 65847537
[PASS] test_fork_pauseThenCancelAndWithdraw() (gas: 615281)
Suite result: ok. 2 passed; 0 failed; 0 skipped
$ cast block-number / chain-id  →  65847579 / 10143      # live chain, not a stale cache
```

**snapshot** (fuzz and invariant tests are excluded because their gas changes with the seed)
```
$ forge snapshot --no-match-test "testFuzz|invariant"   → 112 passed, 2 skipped; .gas-snapshot = 113 lines
$ forge snapshot --check --no-match-test "testFuzz|invariant"   → 112 tests passed, 0 failed (deterministic)
```
Per-function gas (`forge test --gas-report`, Monad pricing). **These numbers set the G6 caps:**
```
MissionVault.approveSubmission   min 30957 · median 122331 · max 151857
MissionVault.withdraw            min 48876 · median  77495 · max  77495
MissionVault.withdrawFor         min 49358 · median 104469 · max 140162
MissionVault.cancelMission       min 40811 · median  52592 · max  63392
MissionFactory.createMission     min 41046 · median 180571 · max 180571
ProvenanceRegistry.anchorDataset min 31136 · median 141981 · max 149944
ProvenanceRegistry.finalizeDataset median 58524 · max 63026
```
→ A 200k cap on `approveSubmission` (G4 F1 proposal) leaves about 30% headroom over the worst case: first
settlement for a new contributor that also completes the mission.

### Test map (security review → tests)
| Finding | Tests |
|---|---|
| F1 pull / bounded gas | `test_approve_gasDoesNotDependOnContributor`, `test_approve_toContractThatRejectsMon_stillSettles`, `test_withdraw_doesNotCopyReturnBomb`, `test_withdrawFor_gasCapped_hungryReceiverFails_selfWithdrawWorks`, `test_withdraw_blocksReentrantWithdraw`, `test_withdraw_twice_revertsNothingToWithdraw`, invariant handler with a rejecting contributor |
| F2 pause / runbook | `test_pause_blocksApprove`, `test_pause_allowsCancelWithdrawAndWithdrawFor`, `test_pause_onlyPauser`, `test_unpause_onlyAdmin`, `test_keyLeakRunbook_pauseThenRevoke`, Registry `test_pause_blocksAnchor`, `test_pause_allowsFinalizeAndVerify`, `test_revokedVerifier_cannotAnchor` |
| F3 replay key | `test_approve_revertsOnDuplicateHashSameMission`, `test_approve_sameHashInOtherMissionSettles`, `test_verifySample_falseForHashSettledOnlyInOtherMission`, `test_verifySample_sameHashSettledInTwoMissions_trueInBoth`, `invariant_pairSettledAtMostOnce` |
| F4 race | `test_cancel_thenApprove_revertsMissionNotActive`, `testFuzz_cancel_refundsExactlyRemainingBudget` |
| F5 re-anchor | `test_reanchor_beforeFinalize_overwritesAndEmitsPreviousRoot`, `test_reanchor_afterFinalize_reverts`, `test_reanchor_stillChecksInputs` |
| F8 setFactory | `test_setFactory_revertsOnEoa`, `…OnFactoryOfOtherVault`, `…OnContractWithoutVault` (no function / silent fallback / wrong vault), `…OnDirtyVaultWord`, `test_registerMission_beforeSetFactory_reverts` |
| F9 forced MON | `test_forcedMon_doesNotChangeAccounting` (real `selfdestruct`), `invariant_balanceCoversObligations` (`balance == owed + forced`) |
| F11 reentrancy | `test_withdraw_blocksReentrantCancel`, `test_withdraw_blocksReentrantWithdraw`, `test_withdraw_callbackCanCreateMission` |
| F13 leaf format | `test_verifySample_matchesOpenZeppelinJsTree` (unchanged vector), `test_verifySample_rejectsInternalNodeAsLeaf` |

## 3. Changed files

- `contracts/src/Errors.sol`, `contracts/src/MissionVault.sol`, `contracts/src/ProvenanceRegistry.sol`
- `contracts/src/interfaces/IMissionVault.sol`, `contracts/src/interfaces/IProvenanceRegistry.sol`
  (`MissionFactory.sol` / `IMissionFactory.sol` are unchanged)
- `contracts/test/MissionVault.t.sol`, `contracts/test/MissionVaultWithdraw.t.sol` (new), `contracts/test/ProvenanceRegistry.t.sol`,
  `contracts/test/Fork.t.sol`, `contracts/test/invariant/VaultHandler.sol`, `contracts/test/invariant/VaultInvariant.t.sol`,
  `contracts/test/utils/BaseTest.sol`, `contracts/test/utils/Mocks.sol`
- `contracts/.gas-snapshot` (new), `contracts/README.md`
- this report

## 4. Risks

- **ABI break against v1:** `SubmissionApproved`, `submissionPaid`, `AlreadyPaid` and `AlreadyAnchored` are gone, and
  `DatasetAnchored` has a new field. G6 (`lib/monad`) must use the v2 ABI. v1 was never deployed, so nothing on-chain is affected.
- `withdrawFor` to a contract contributor whose `receive()` needs more than 50k gas always reverts. That contributor must
  call `withdraw()` itself. This is by design (F1) and tested.
- A reverted `withdrawFor` still costs its full gas limit on Monad. `lib/monad` should simulate it first (G4 F7).
- Still **not audited**. Phase 1 of the G4 code review (pelin) is the next check.

## 5. Open questions

- None block this task. For G5 (deploy script): the admin already holds `PAUSER_ROLE` from the constructor.
  Granting it again, as WALLETS.md plans, is harmless.

## 6. Next step

- Lead: review the diff, then move the card to done.
- pelin: phase-1 code review against this commit.
- G6: take the caps from the gas table above.
- G5: deploy script + role-assertion test on both contracts (F10).

**Platform:** verified on **Windows 11 Pro (10.0.26200), Git Bash, Foundry 1.8.3**. Contract and test code is
platform-independent: Solidity/EVM with no file paths, processes or shell calls. On macOS/Linux the same `forge` commands
give the same results. Those platforms were **not run** because only this Windows machine was available.
