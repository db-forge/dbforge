# TASK-MUI9LJK0MABPG (G4): phase 1, code security and code review (pelin)

Scope: `contracts/src/*` and `contracts/test/*` at `feat/contracts` **`0be80c3`** (G3b, v2). Checked against
`contracts/docs/ARCHITECTURE.md` v2, my phase-0 report (`TASK-MUI9LJK0MABPG-pelin-faz0.md`) and Nil's G3b report
(`TASK-MUIC0XQBDHD64-nil.md`).
I changed no code, no documentation and made no commit. I used no private key. I ran the attack PoCs in a **copy** in my
scratchpad (`…/scratchpad/c`), not in `contracts/`.

## 0. Verdict

| Level | Count | IDs |
|---|---|---|
| CRITICAL | 0 | |
| HIGH | 0 | |
| MEDIUM | 1 | M-1 finalize ↔ re-anchor race |
| LOW | 5 | L-1 … L-5 |
| INFO / code review | 7 | I-1 … I-7 |

**G5 decision: GO for the Monad testnet deploy**, with one condition: the owner either fixes M-1 before deploy
(recommended, about 5 lines and 2 tests) or accepts it in writing, with the off-chain rule in §3 M-1.
The contracts cannot be upgraded, so fixing M-1 after deploy means a new deployment.
**NO-GO for mainnet or real funds:** the code is not audited (ARCHITECTURE §9).

All six v1 phase-0 findings that needed a contract change (F1, F2, F3, F5, F8, F9) are fixed in code and tested.
The two HIGH findings from phase 0 (F1, F2) are closed.

---

## 1. Evidence (command output from this run)

Environment: Windows 11 Pro 10.0.26200, Git Bash, `forge Version: 1.8.3`, solc 0.8.28, `network = "monad"`.

```
$ git -C /d/dbforge rev-parse --abbrev-ref HEAD; git rev-parse --short HEAD
feat/contracts
0be80c3

$ forge test
Suite result: ok. 0 passed; 0 failed; 2 skipped      (Fork, no --fork-url)
Suite result: ok. 34 passed; 0 failed; 0 skipped     (ProvenanceRegistry)
Suite result: ok. 7 passed; 0 failed; 0 skipped      (MissionFactory)
Suite result: ok. 25 passed; 0 failed; 0 skipped     (MissionVaultWithdraw)
Suite result: ok. 52 passed; 0 failed; 0 skipped     (MissionVault)
Suite result: ok. 1 passed; 0 failed; 0 skipped      (VaultInvariant, 6 invariants)
Ran 6 test suites in 27.84s (31.01s CPU time): 119 tests passed, 0 failed, 2 skipped (121 total tests)

$ forge test --fork-url https://testnet-rpc.monad.xyz --match-contract Fork -vv
[PASS] test_fork_createSettleWithdrawAnchorFinalize() (gas: 1059035)
  fork block: 65850336
[PASS] test_fork_pauseThenCancelAndWithdraw() (gas: 615281)
Suite result: ok. 2 passed; 0 failed; 0 skipped

$ forge coverage --report summary
| src/MissionFactory.sol          | 100.00% (6/6)    | 100.00% (5/5)    | 100.00% (1/1)   | 100.00% (2/2)   |
| src/MissionVault.sol            | 100.00% (76/76)  | 100.00% (92/92)  | 100.00% (21/21) | 100.00% (14/14) |
| src/ProvenanceRegistry.sol      | 100.00% (40/40)  | 100.00% (48/48)  | 100.00% (10/10) | 100.00% (7/7)   |
| test/invariant/VaultHandler.sol | 93.18% (82/88)   | 95.37% (103/108) | 90.91% (20/22)  | 72.73% (8/11)   |
| test/utils/BaseTest.sol         | 90.00% (27/30)   | 81.48% (22/27)   | N/A (0/0)       | 100.00% (8/8)   |
| test/utils/Mocks.sol            | 95.45% (42/44)   | 97.06% (33/34)   | 100.00% (3/3)   | 94.12% (16/17)  |
| Total                           | 96.13% (273/284) | 96.50% (303/314) | 96.49% (55/57)  | 93.22% (55/59)  |
EXIT 0

$ forge lint src
EXIT 0          (no findings; 4 inline disables, all checked, see I-6)
```

**Slither:** not installed (`which slither` → not found, `pip show slither-analyzer` → not found). I did **not** install it.
Suggested setup, for the owner or CI:
```sh
python -m pip install --user slither-analyzer   # needs Python ≥ 3.8; also installs crytic-compile
cd contracts && slither . --foundry-compile-all --filter-paths "dependencies|test" --exclude-dependencies
```
Expected noise to triage: `arbitrary-send-eth` on `_sendValue` (by design: the target is `msg.sender`, the credited
contributor or the buyer), `low-level-calls`/`assembly` (on purpose, no returndata copy), `reentrancy-events` in the Factory.
In its place I ran `forge lint` (clean) and the manual review plus the PoCs below.

**Attack PoCs (scratch copy, not committed):**
```
$ forge test --match-contract "PelinCancelReentry|PelinPoC"
[PASS] test_cancelRefundCallback_cannotReenterCancelOrWithdraw()
[PASS] test_poc_anchorAcceptsZeroManifest()
[PASS] test_poc_confusingZeroSampleError()
[PASS] test_poc_creditToVaultIsLockedForever()
[PASS] test_poc_finalizeFreezesRootBuyerNeverSaw()          ← M-1 shown
[PASS] test_poc_lowGasWithdrawFor_revertsAll()
  ok: 0  booked: 0  withdrawable: 100000000000000000     ← low gas: whole tx reverts, credit kept

$ forge test --match-contract PelinGasSweep -vv            (withdrawFor, outer gas 80k→100k, step 500)
     40 × "ok 0 booked 0"   (80 000 … 99 500 gas: the whole call reverts)
      1 × "ok 1 booked 5"   (100 000 gas: paid AND the receiver's bookkeeping ran)
→ no half-paid state was seen (paid but receiver logic starved)

$ forge test --match-contract VaultInvariant -vv          (logs of the LAST sequence only)
 VaultInvariantTest invariants (runs: 256, calls: 16384, reverts: 0)
 approve 2684 · cancel 2679 · createMission 2732 · forceSend 2790 · togglePause 2761 · withdraw 2738
  missions: 16 · ok settles: 6 · rejected duplicates: 1 · hash reused in another mission: 1
  ok withdrawals: 1 · failed withdrawals: 6 · ok cancels: 0 · rejected while paused: 0
```

---

## 2. F1–F13 traceability (phase 0 → v2 code → tests)

| # | Phase-0 finding | How v2 handles it (code) | Tests (file:line) | Status |
|---|---|---|---|---|
| F1 HIGH | Push payout + Monad gas-limit billing → verifier gas drain | Pull payments. `approveSubmission` makes **no external call** (`MissionVault.sol:102-125`). Transfers are only in `withdraw`/`withdrawFor`/`cancelMission`, through an assembly `call` with no returndata copy (`MissionVault.sol:194-200`). `withdrawFor` stipend `WITHDRAW_FOR_GAS = 50_000` (`:37`, `:134-136`). | `MissionVault.t.sol:379` (approve gas is the same for an EOA and a gas burner, both 135 435), `:370`; `MissionVaultWithdraw.t.sol:147` (1 MB return bomb vs control, ±5k), `:201` (stipend bounds the helper's gas), `:79`, `:89`, `:99` | **Closed** |
| F2 HIGH | Leaked verifier key, no brake; "admin cannot move funds" is false | `Pausable` + `PAUSER_ROLE` on the Vault and the Registry. Approve and anchor are `whenNotPaused` (`MissionVault.sol:105`, `ProvenanceRegistry.sol:43`). `unpause` is admin-only. Admin gets PAUSER in the constructor. ARCH §2 wording fixed. Runbook in ARCH §2 and WALLETS.md. | `MissionVaultWithdraw.t.sol:233,247,259,276,284,290,304,331`; `ProvenanceRegistry.t.sol:224,237,247,272`; `MissionVault.t.sol:560` | **Closed** (residual risk: see I-2) |
| F3 MED | Global `submissionPaid`: griefing + cross-mission `verifySample` | Replay key `settlements[missionId][hash]` (`MissionVault.sol:44`, `:111-112`). `verifySample` checks the settlement in **this** mission (`ProvenanceRegistry.sol:101`). Cross-mission dedup moved off-chain (ARCH §8). | `MissionVault.t.sol:344,352`, `testFuzz …:400`; `ProvenanceRegistry.t.sol:386,404,420`; `invariant_pairSettledAtMostOnce` (`VaultInvariant.t.sol:103`) | **Closed** (different design from my proposal, and equivalent) |
| F4 MED | Cancel ↔ approve race | **Accepted, off-chain.** No contract change. Backend rule: the buyer sees media only after settlement (ARCH §8, §9). | `MissionVault.t.sol:531` (cancel first → `MissionNotActive`, nothing credited), `testFuzz …:464` | **Accepted.** Backend (Developer 3) must enforce the rule. Not verifiable in `contracts/`. |
| F5 MED | One-time anchor, no fix path | Re-anchor allowed until `finalized` (`ProvenanceRegistry.sol:50`). `DatasetAnchored` carries `previousRoot`. `verifySample` returns false early when not anchored (`:96`). | `ProvenanceRegistry.t.sol:181,202,212,382` | **Closed.** New race introduced: **M-1** |
| F6 MED | Raw media hash on-chain = PII link | **Deferred.** `TODO(F6)` in `lib/monad` (ARCH §8, §9). | none (the contract only sees `bytes32`) | **Accepted and deferred.** Must be decided before the first *real* personal media is settled. The chain cannot forget it. |
| F7 MED | Monad async + gas on limit | Off-chain (`lib/monad`, G6): simulate → cap → no auto-retry. The contract side delivered gas data: `approveSubmission` max 151 857 gas (Nil's gas report), `.gas-snapshot` committed. | `MissionVault.t.sol:379`; `.gas-snapshot` | **Contract part done.** G6 must use a cap of about 200k. See L-4. |
| F8 LOW | `setFactory` unchecked | Checks code, `vault()` via staticcall, 32-byte return, decoded as `uint256` (`MissionVault.sol:58-70`). | `MissionVault.t.sol:55,61,68,79,87,94,101,116,129,139` | **Closed** (see I-3: a typo guard, not a trust guard) |
| F9 LOW | Forced MON breaks `==` | Invariant 1 is `>=`. The code never reads `address(this).balance`. | `MissionVault.t.sol:422`; `invariant_balanceCoversObligations` (`VaultInvariant.t.sol:69`, checks `== owed + forced`) | **Closed** |
| F10 LOW | Two role registries | Documented (ARCH §2 runbook, WALLETS.md). Test: a Vault verifier cannot anchor. | `ProvenanceRegistry.t.sol:114` | **Partly open.** `script/` is empty, so the deploy role-assertion test is **G5's job** (DoD item, §5). |
| F11 LOW | Reentrancy via callbacks | `nonReentrant` on `withdraw`, `withdrawFor`, `cancelMission`; CEI everywhere. `approveSubmission` makes no call. | `MissionVaultWithdraw.t.sol:99,114,132`; my PoC `cancelRefundCallback_cannotReenter…` (PASS) | **Closed.** Test gap: the cancel→re-entry direction has no repo test (L-5). |
| F12 LOW | Buyer reserve balance (10 MON) | Off-chain (frontend / `lib/monad` pre-check). No contract change needed. | none | **Accepted, off-chain** |
| F13 INFO | Leaf format / second preimage | Unchanged, correct: `ProvenanceRegistry.sol:97`. | `ProvenanceRegistry.t.sol:331` (OZ JS tree vector), `:371`, `:433` | **OK** |

---

## 3. Findings (phase 1)

### M-1: MEDIUM: `finalizeDataset` can freeze a root that the buyer never reviewed (re-anchor race)

- **Where:** `ProvenanceRegistry.sol:68-77` (`finalizeDataset(uint256 missionId)`), together with the re-anchor path
  `:40-65`.
- **Scenario:**
  1. The verifier anchors the correct root `R`. The buyer's UI shows `R` and its manifest. The buyer checks it and sends
     `finalizeDataset(id)`.
  2. Before that tx executes, `anchorDataset(id, R')` lands. This can be the attacker with the leaked verifier key
     (F2 scenario), or an honest backend re-anchor that runs at the same time (a bug fix or retry).
  3. `finalizeDataset` has no "expected root" argument, so it freezes `R'`. `finalized` is permanent: the real samples
     never verify again and the dataset cannot be fixed.
  On Monad, execution is asynchronous and the verifier's txs are cheap and fast, so the window is real. Funds are not
  at risk. Provenance integrity and buyer consent are at risk, and the damage is permanent.
- **PoC:** `test_poc_finalizeFreezesRootBuyerNeverSaw`: PASS on `0be80c3` (the attack works).
- **Fix (recommended before G5):** ARCHITECTURE §5 first, then the code:
  ```solidity
  error RootMismatch(uint256 missionId, bytes32 expected, bytes32 actual);

  function finalizeDataset(uint256 missionId, bytes32 expectedRoot) external {
      if (msg.sender != vault.getMission(missionId).buyer) revert NotBuyer(missionId);
      Dataset storage d = datasets[missionId];
      if (d.anchoredAt == 0) revert NotAnchored(missionId);
      if (d.finalized) revert AlreadyFinalized(missionId);
      if (d.merkleRoot != expectedRoot) revert RootMismatch(missionId, expectedRoot, d.merkleRoot);
      d.finalized = true;
      emit DatasetFinalized(missionId, msg.sender);
  }
  ```
  Optional: also bind `metadataHash` (the manifest). This is an ABI change for G6 (`lib/monad`) and the frontend.
- **If the owner accepts instead:** the backend never re-anchors after it has told the buyer that the dataset is ready.
  After finalize, the frontend reads `getDataset().merkleRoot` and warns the user if it differs from the reviewed root.
- **Test draft (for Nil, `ProvenanceRegistry.t.sol`):**
  ```solidity
  function test_finalize_revertsWhenRootChangedSinceReview() public {
      // setUp: missionId Completed, `root` anchored
      bytes32 reviewed = registry.getDataset(missionId).merkleRoot;
      vm.prank(verifier);
      registry.anchorDataset(missionId, keccak256("other"), TARGET, MANIFEST); // lands first
      vm.prank(buyer);
      vm.expectRevert(abi.encodeWithSelector(RootMismatch.selector, missionId, reviewed, keccak256("other")));
      registry.finalizeDataset(missionId, reviewed);
      assertFalse(registry.getDataset(missionId).finalized);
  }

  function test_finalize_withReviewedRoot_succeeds() public {
      bytes32 reviewed = registry.getDataset(missionId).merkleRoot;
      vm.prank(buyer);
      registry.finalizeDataset(missionId, reviewed);
      assertTrue(registry.getDataset(missionId).finalized);
  }
  ```

### L-1: LOW: a credit to an address that can never receive MON is locked forever

- **Where:** `MissionVault.sol:109` (only `contributor != 0` is checked). There is no sweep or recovery path, by design.
- **Scenario:** a backend bug (or a leaked key) settles to `address(vault)`, the Factory, the Registry, or a contract
  without `receive()` and without a way to call `withdraw()`. The reward moves from `remainingBudget` into `credited`,
  and nobody can ever withdraw it. The buyer cannot get it back by cancelling.
- **PoC:** `test_poc_creditToVaultIsLockedForever`: `withdrawFor(vault)` → `TransferFailed`, and the credit stays.
- **Fix:** a cheap on-chain guard, `if (contributor == address(this)) revert InvalidContributor();`, and in `lib/monad`
  reject the Vault, Factory and Registry addresses (and warn when the address has code). Low impact: it needs the
  verifier to make a mistake.

### L-2: LOW: `registerMission` stays open while paused (Nil's choice)

- **Where:** `MissionVault.sol:73-98` (no `whenNotPaused`), test `MissionVaultWithdraw.t.sol:324`.
- **Assessment:** this is safe for the **key-leak** incident. Funding moves MON in, never out, and the buyer can cancel
  at any time. For an **unknown bug** incident, though, new deposits keep going into a contract that is under
  investigation, and those missions cannot settle until unpause.
- **Fix (no contract change needed for testnet):** `lib/monad` / the frontend reads `paused()` and blocks "Create
  mission" while it is true. Post-MVP: consider `whenNotPaused` on `registerMission`.

### L-3: LOW: the invariant handler covers fewer attacker scenarios than it looks

- **Where:** `test/invariant/VaultHandler.sol`, `VaultInvariant.t.sol`.
- **Covered:** duplicate (same mission) and reused (other mission) hashes, a MON-rejecting contributor, `withdrawFor` by a
  helper, cancel by a stranger, pause/unpause, forced MON. The invariants are strong
  (`balance == owed + forced`, ghost accounting, pair-once, no settle after end or while paused).
- **Gaps:**
  1. There is no re-entrant actor (`ReentrantReceiver`), no gas-hungry or return-bomb contributor, and no contract buyer
     whose refund callback re-enters. Unit tests cover these, but never in random sequences.
  2. The success rate per sequence is low. The last sequence logged `ok settles: 6`, `ok cancels: 0`,
     `rejected while paused: 0` in 64 calls. The `afterInvariant` counters only show the **last** run, so they do not
     prove coverage across the 256 runs. `cancel` returns early on 3 of 4 seeds.
  3. There is no Registry invariant, for example "a finalized root never changes" or "anchored ⇒ mission ended and
     sampleCount == acceptedCount".
- **Fix:** add the attacker actors to `contributors`/`buyers`, make the counters cumulative across runs (or assert minimums
  in `afterInvariant`), raise the cancel rate, and add a small `RegistryHandler` with a "finalized root is immutable"
  invariant.

### L-4: LOW: front-running `withdrawFor` makes the backend pay a full gas limit (Monad)

- **Where:** `MissionVault.sol:182-184` (`NothingToWithdraw`).
- **Scenario:** the backend (verifier wallet, per WALLETS.md) sends `withdrawFor(c)`. Anyone (or `c` itself) lands
  `withdrawFor(c)`/`withdraw()` first. The backend tx reverts `NothingToWithdraw` and still pays its full gas limit on
  Monad. The contributor is paid either way, so the only damage is gas griefing, and the attacker pays about the same
  gas. A contract change does not help, because a non-reverting no-op is also billed on its limit.
- **Fix (G6):** use a tight limit (about 1.15 × estimate, max about 160k per Nil's gas report). Treat `NothingToWithdraw`
  as "already paid", never retry, and alert if it happens often.

### L-5: LOW: missing tests (code is correct, test is missing)

| Missing test | Why | Evidence |
|---|---|---|
| Cancel refund callback re-enters `cancelMission` / `withdraw` | The other direction is tested. `ReentrantReceiver.cancel()` (`Mocks.sol:50`) is never used. | My PoC `test_cancelRefundCallback_cannotReenterCancelOrWithdraw`: PASS (guard works) |
| M-1 finalize/re-anchor race | see M-1 | `test_poc_finalizeFreezesRootBuyerNeverSaw` |
| Settlement to `address(vault)` | see L-1 | `test_poc_creditToVaultIsLockedForever` |
| `withdrawFor` with low outer gas (63/64 rule) | Proves a helper cannot force a half-paid state | `PelinGasSweep` (above) |
| Deploy script role assertions on **both** contracts (F10) | `script/` is empty | G5 DoD |
| Optional: EIP-7702 delegated contributor (`vm.signDelegation`) | Monad supports 7702, so "EOA" can have code | none |

---

## 4. v2 surface: detailed review

### 4.1 `withdraw` / `withdrawFor`

- **Reentrancy:** CEI (`withdrawn += amount` and the event come before `_sendValue`) plus the shared `nonReentrant`.
  Cross-function re-entry into `withdraw`, `withdrawFor` and `cancelMission` hits the same guard (tested in both
  directions, including my PoC). Re-entry into the Factory → `registerMission` is harmless (tested at `:132`).
  Re-entry into `approveSubmission` needs `VERIFIER_ROLE` on the callback contract, so it cannot happen, and approve makes
  no call. Read-only re-entry into the Registry sees final state. **OK.**
- **Return bomb:** `call(gasLimit, to, amount, 0, 0, 0, 0)` does not copy returndata. The test compares against a
  control, not an absolute number (important under Monad's linear memory pricing). **OK.**
- **50k stipend:** it bounds the helper's cost (`used < 50k + 100k` asserted, 141 096 measured). A receiver that needs
  more gas makes `withdrawFor` revert, keeps its credit, and can still `withdraw()` with all gas (tested at `:201`).
  **OK.**
- **`withdrawFor` griefing:** anyone can push a contributor's balance to them at any time. The MON can only go to
  `contributor`, and the amount is its whole balance, so nothing can be redirected. With too little outer gas the
  *whole* tx reverts (`TransferFailed` rolls back `withdrawn`), so a helper cannot leave a half-paid state (PoC sweep).
  What is left: timing is forced (it only matters for exotic contract wallets), and L-4. **OK.**
- **Monad reserve rule:** a contributor's `withdraw` has value 0, and the Vault is a contract, so the 10 MON EOA rule does
  not apply to payouts or refunds. **OK.**

### 4.2 Pause matrix (checked against the code)

| Function | Vault paused | Registry paused | Correct? |
|---|---|---|---|
| `approveSubmission` | blocked | n/a | ✔ (F2) |
| `anchorDataset` | n/a | blocked | ✔ (F2) |
| `withdraw`, `withdrawFor`, `cancelMission` | open | n/a | ✔ rescue paths stay open |
| `registerMission` / `createMission` | open | n/a | ✔ acceptable (L-2) |
| `finalizeDataset`, `verifySample`, views | n/a | open | ✔ (M-1 applies whether paused or not) |
| `grantRole` / `revokeRole` / `setFactory` | open | open | ✔ the runbook needs revoke while paused |
| `pause` | PAUSER | PAUSER | ✔ |
| `unpause` | ADMIN only | ADMIN only | ✔ a compromised guardian can only cause a pause (DoS). Admin unpauses and revokes. |

Pausing does **not** stop an attacker from withdrawing credits it created before the pause (withdraw stays open on
purpose). The brake only stops **new** credits. This is by design. See I-2.

### 4.3 Re-anchor

The re-anchor checks are right: mission ended, not finalized, root ≠ 0, `sampleCount == acceptedCount`.
`previousRoot` is emitted and `anchoredAt` is refreshed. The remaining issue is M-1 (the finalize race).
`metadataHash` may be zero (I-4).

### 4.4 `(missionId, hash)` replay

This is correct. `settlements[missionId][hash].contributor != 0` is the settled flag. `contributor == 0` and `hash == 0`
are rejected, so the flag cannot be spoofed. The same hash in another mission settles, as ARCH v2 intends.
`verifySample` is scoped to the mission. Invariant 4 plus the fuzz tests cover it.

### 4.5 `setFactory` → `InvalidFactory`

The implementation is careful: no code, reverting `vault()`, silent fallback, wrong vault, short/long return and dirty
upper bits are all rejected and tested. Note I-3.

### 4.6 Nil's four implementation choices

| Choice | Security assessment |
|---|---|
| Admin gets `PAUSER_ROLE` in the constructor | **Good.** The brake exists from block 1, before the deploy script grants the guardian. Granting it again in G5 is a no-op. |
| `approveSubmission` without `nonReentrant` | **Safe.** It makes no external call. Re-entry into it would need `VERIFIER_ROLE` on the callback contract. It also saves gas on the hot path. |
| `getContributorBalance` with unnamed returns | **No security impact.** The generated ABI has no output names, although `IMissionVault` names them. G6 must read the positional tuple `[credited, withdrawn, withdrawable]` (I-5). |
| `registerMission` open while paused | **Acceptable for testnet** (L-2). Block it in the UI while paused. |

---

## 5. Code review: ARCHITECTURE v2 conformance and consistency

- **Conformance:** every function, state variable, constant, event and error in ARCH v2 §3–§7 matches the code
  (checked line by line). v1 leftovers (`SubmissionApproved`, `AlreadyPaid`, `AlreadyAnchored`, `submissionPaid`) are
  gone. All 19 custom errors in `Errors.sol` are used.
- **I-1 (INFO):** `SampleCountMismatch(0, 0)` is the error for "a cancelled mission with no samples, sampleCount 0"
  (`ProvenanceRegistry.sol:52-54`; PoC `confusingZeroSampleError`). It is correct but reads oddly. Document it in the
  `lib/monad` error map, or add `NoSamples()`.
- **I-2 (INFO, residual F2):** there is no rate limit on settlement. A leaked verifier key can credit all active budgets
  before a human pauses, and those credits can still be withdrawn after the pause. This is accepted in ARCH §9. For
  production: a per-mission rate limit or a withdraw delay on fresh credits, and multiple verifiers.
- **I-3 (INFO):** the `setFactory` check is a typo guard, not a trust guard. Any contract whose `vault()` returns this
  Vault passes. That is fine, because admin is trusted for this one-time call.
- **I-4 (LOW/INFO):** `anchorDataset` accepts `metadataHash == 0` (PoC `anchorAcceptsZeroManifest`), while
  `registerMission` rejects a zero metadata hash (`InvalidMetadata`). ARCH §5 says nothing. For consistency, add the
  check (and the ARCH line).
- **I-5 (INFO):** ABI note for G6: unnamed outputs of `getContributorBalance` (see §4.6).
- **I-6 (INFO):** the 4 `forge-lint: disable` lines are all justified: `setFactory` has no event (one-time, ARCH §6),
  the Factory emits after a trusted immutable call, the `uint64` timestamp cast, and the unused `getSettlement` returns.
- **I-7 (INFO):** naming and NatSpec are consistent (`Settled`/`Withdrawn`, `withdrawable = credited − withdrawn`).
  Every state-changing function emits an event, except `setFactory` (by spec). Events follow state changes (CEI).

---

## 6. G5 deploy: GO / NO-GO

**GO for Monad testnet** at `0be80c3` (or at its M-1 fix commit), when these conditions hold:

1. **M-1:** fixed (preferred) **or** accepted in writing by the owner (tuna), with the off-chain rule from §3.
2. The deploy script (G5) grants `VERIFIER_ROLE` and `PAUSER_ROLE` on **both** contracts, calls `setFactory`, and has a
   test that asserts all role holders on both contracts (F10). The admin is **not** the buyer key (WALLETS.md).
3. The guardian address is a different person's wallet. Nobody commits keys or `.env` files (WALLETS.md rules).
4. G6 (`lib/monad`) uses the gas caps (approve about 200k, withdrawFor about 160k), simulates first, never auto-retries,
   and blocks "create" while `paused()` (L-2, L-4, F7).
5. The deployed addresses and deploy tx hashes go into `contracts/deployments/monad-testnet.json`.

**NO-GO** for mainnet or real value until an external audit is done and F6 (privacy) is decided.

---

## 7. Changed files

- `contracts/docs/agent-results/TASK-MUI9LJK0MABPG-pelin-faz1.md` (this report). **Not committed** (task rule).
- Nothing in `contracts/src`, `contracts/test`, or the docs was changed. The PoC tests live only in my scratchpad copy.
- `TASK-MUI9LJK0MABPG-pelin-faz0.md` was **not** overwritten. The task footer named the faz0 path, but the task body
  asks for this faz1 path, and overwriting faz0 would lose the phase-0 record.

## 8. Risks

- If M-1 is deployed without a fix, a verifier key leak or a concurrent re-anchor can permanently corrupt a dataset's
  provenance (no funds lost).
- F6 (privacy) is irreversible once real personal media hashes are on-chain.
- The contracts are not audited. The invariant fuzzing is weaker than the numbers suggest (L-3).

## 9. Open questions (owner / lead)

1. M-1: fix now (ABI change `finalizeDataset(missionId, expectedRoot)`), or accept for testnet?
2. L-1: add `contributor != address(this)` on-chain, or only in `lib/monad`?
3. I-4: should `anchorDataset` reject a zero manifest hash?

## 10. Next step

- Owner (tuna): decide on M-1, L-1 and I-4, and update ARCHITECTURE §5 if the decision is to fix.
- Nil: M-1 fix + tests (drafts in §3), the L-5 tests, and the L-3 handler improvements (can come after G5).
- G5: deploy script with the role-assertion test (F10). G6: caps and error map (L-4, I-1, I-5).
- pelin: a short re-check of the M-1 fix diff before deploy, if the owner chooses to fix it.

**Platform:** checked on **Windows 11 Pro 10.0.26200 (Git Bash, Foundry 1.8.3)**: `forge test`, `forge coverage`,
`forge lint`, the Monad testnet fork test and the PoCs. The contracts and tests are Solidity/EVM only: no file paths,
processes or shell calls. So on macOS and Linux the same `forge` commands give the same results.
**macOS/Linux were not run**, because only this Windows machine was available.
