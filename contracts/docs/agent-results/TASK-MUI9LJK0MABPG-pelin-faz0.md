# TASK-MUI9LJK0MABPG (G4) — FAZ 0: design threat model · pelin

Scope: design-level review of `contracts/docs/ARCHITECTURE.md` (commit `1c26978`, branch `feat/contracts`)
and the Monad facts in `agent-results/TASK-MUI9KOICNMZP8-tuna.md`. No code exists yet (`contracts/src` is empty).
Nothing was changed: no code, no ARCHITECTURE.md edit, no commit, no keys.

Phase 1 (code review of Nil's G3 implementation) comes later. The G3 test list in §4 is what phase 1 will check against.

---

## 1. What was done

Read both documents and walked every trust edge and state transition:
Factory→Vault, Registry→Vault, admin/verifier/buyer/contributor powers, `setFactory`, `registerMission`,
`approveSubmission`, `cancelMission`, `anchorDataset`, `finalizeDataset`, `verifySample`, and the Monad
gas / reserve-balance / async-execution rules.

Summary:

| # | Level | Title |
|---|---|---|
| F1 | **HIGH** | Push payment + Monad gas-limit billing → verifier wallet can be drained by gas griefing (service-wide DoS) |
| F2 | **HIGH** | A leaked verifier key drains all active budgets; no pause; doc claim "admin cannot move funds" is not true |
| F3 | MEDIUM | Global `submissionPaid` enables "claim-first" griefing and breaks per-mission `verifySample` |
| F4 | MEDIUM | Cancel ↔ approve race: buyer can front-run approvals and keep the work unpaid |
| F5 | MEDIUM | `anchorDataset` is one-time with no correction path; root content is not bound to the mission |
| F6 | MEDIUM | Public `contributor ↔ mediaHash` link is a privacy (PII) leak |
| F7 | MEDIUM | Monad async execution + gas billing: nonce, stale reads, lost races cost full gas |
| F8 | LOW | `setFactory`: not front-runnable, but irreversible and unchecked |
| F9 | LOW | Invariant 1 (`balance == Σ remainingBudget`) breaks with forced MON |
| F10 | LOW | Two separate `AccessControl`s → revocation must happen twice |
| F11 | LOW | Reentrancy surface via the contributor callback (design is fine; needs tests) |
| F12 | LOW | Reserve balance: buyer funding tx reverts and still pays gas |
| F13 | INFO | `verifySample` leaf format and second-preimage: **correct** |

No CRITICAL finding at design level. F1 and F2 should be fixed (or explicitly accepted) before G3 is merged.

---

## 2. Findings

### F1 — HIGH — Push payment + gas-limit billing → verifier gas drain (DoS)

**Scenario.**
1. A contributor registers a payout address that is a contract (or an EIP-7702 delegated EOA — Monad supports 7702,
   so "it is an EOA" does not mean "it has no code").
2. Its `receive()` burns gas (a loop) or returns a huge returndata blob. Solidity's `(bool ok, ) = to.call{value: v}("")`
   **still copies returndata into memory** → "return bomb".
3. The backend estimates gas for `approveSubmission` → the estimate is millions of gas (up to the 30M per-tx limit).
4. On Monad the sender pays **gas limit × price**, not gas used. 30M × 102 gwei ≈ **3.06 MON per approval**.
   The verifier wallet holds ~5 MON "gas only" → two approvals and the verifier is empty.
   All missions stop being paid (service-wide DoS), not only the attacker's submission.
5. Variant: `receive()` reverts → approval reverts. On Monad a reverted tx still pays its full gas limit.
   If the backend retries automatically, each retry burns gas.

ARCHITECTURE.md §9 says "only that submission is affected". That is not true on Monad: the **verifier's balance** is affected.

**Proposed change (ARCHITECTURE.md §3 + §9).**
- Payout with a **fixed gas stipend** and **no returndata copy** (assembly `call`, or OZ `LowLevelCall`/ExcessivelySafeCall pattern),
  e.g. `PAYOUT_GAS = 50_000`.
- On failure do **not** revert: credit a pull balance.
  ```solidity
  mapping(address => uint256) public pendingWithdrawals;
  event PayoutDeferred(uint256 indexed missionId, address indexed contributor, uint256 amount);
  function withdraw() external nonReentrant; // contributor pulls
  ```
  The approval then always succeeds, `submissionPaid` is set, and gas cost is bounded.
- Invariant 1 becomes `balance >= Σ remainingBudget + Σ pendingWithdrawals`.
- `lib/monad` (G6): hard cap on the `approveSubmission` gas limit (e.g. 200k). If the estimate is above the cap, do not send;
  mark the submission `needs_review`. Never auto-retry a reverted approval.
- Ops: alert when the verifier balance is below a threshold.

**G3 tests.**
- `test_approve_toGasBurningContributor_defersPayout_andUsesBoundedGas` (assert `gasleft` delta < cap).
- `test_approve_toReturnBombContributor_doesNotCopyReturndata`.
- `test_approve_toRevertingContributor_creditsPendingWithdrawal`.
- `test_withdraw_paysPending_once` + reentrancy attempt in `withdraw`.
- Invariant fuzz with a handler that uses reverting / gas-burning contributors.

---

### F2 — HIGH — Verifier key compromise: blast radius and missing brake

**Scenario.**
- The verifier hot key leaks (it lives on the backend server). The attacker calls
  `approveSubmission(missionId, attacker, freshRandomHash)` in a loop → drains **every active mission's remainingBudget**.
  §9 already says this. What is missing:
  - There is **no pause**. The only brake is `revokeRole`, sent by the admin — a human who must notice first.
    With ~300 ms blocks the attacker can empty the Vault in seconds.
  - The attacker can also **poison provenance**: `anchorDataset` a fake root for every ended mission. It is one-time,
    so the real root can never be written (see F5).
  - The attacker can **burn media hashes**: approve real, not-yet-paid media hashes (if they know them) to their own address,
    so the honest contributor is blocked forever by the global `submissionPaid` (see F3).
- Admin compromise: `DEFAULT_ADMIN_ROLE` can `grantRole(VERIFIER_ROLE, self)` and then drain.
  §2 says admin "**Cannot move funds**" — this is **false transitively**. The demo plan also uses the deployer wallet
  as the buyer (35 MON), so the admin key is a hot, frequently used key.

**Proposed change.**
- Add `Pausable` to Vault (and Registry): `pause()` by a `PAUSER_ROLE` (admin + a second "guardian" key held by a different person);
  `unpause()` admin only. `approveSubmission` and `anchorDataset` are `whenNotPaused`.
  `cancelMission` and `withdraw` stay **open while paused** so buyers can rescue funds.
- Optional, cheap rate limit: `maxApprovalsPerBlock` or per-mission `approvals per N seconds` — reduces drain speed.
- §2 wording: "Admin cannot move funds **directly**; it can grant `VERIFIER_ROLE`, which can pay out active budgets."
- Use a separate admin key (not the buyer wallet). Prefer `AccessControlDefaultAdminRules` (two-step admin transfer with delay).
- Runbook line in §9: "Key leak → pause → revoke on Vault **and** Registry → rotate".

**G3 tests.**
- `test_pause_blocksApproveAndAnchor`, `test_pause_allowsCancelAndWithdraw`.
- `test_nonPauser_cannotPause`, `test_onlyAdmin_canUnpause`.
- `test_revokedVerifier_cannotApprove` (Vault) and `test_revokedVerifier_cannotAnchor` (Registry).
- `test_verifier_cannotApprove_completedOrCancelledMission`, `test_verifier_cannotExceedRemainingBudget`.
- `test_admin_cannotCallApproveWithoutVerifierRole`.

---

### F3 — MEDIUM — Global `submissionPaid`: claim-first griefing + cross-mission `verifySample`

**Scenario A (griefing / theft).** Only the verifier can set `submissionPaid`, so this is not an on-chain front-run.
The vector goes through the backend:
1. Attacker gets a copy of a victim's media file (leaked storage URL, shared photo, or a pending submission the buyer UI shows).
2. Attacker creates a tiny mission as buyer (e.g. reward 0.001 MON), submits the victim's file as contributor to it,
   and gets it approved first. Cost: gas + 0.001 MON that goes back to the attacker.
3. The victim's real submission to the real mission now reverts `AlreadyPaid` forever.

Also: a one-byte change gives a new hash, so global dedup only stops exact copies — the protection is weak,
but the griefing power is real.

**Scenario B (wrong proof).** `verifySample` checks `vault.submissionPaid(hash)` (global). A hash that was paid in
mission Y and appears in mission X's tree returns `true` for X. So "proof matches AND paid" does not mean
"this sample was paid **in this mission**".

**Proposed change.**
- Replace `mapping(bytes32 => bool) submissionPaid` with
  `mapping(bytes32 => uint256) public paidInMission; // 0 = unpaid (missionId starts at 1)`.
  Global dedup stays (non-zero ⇒ already paid). `verifySample` checks `paidInMission[hash] == missionId`.
- Backend: dedup is first-submitted-wins **by DB timestamp**, checked before approval; do not expose the media or
  `media_hash` of pending submissions to other users (buyer included — see F4).
- Product decision to write down: is "same file in two different missions" really forbidden? If not, use
  `keccak256(abi.encode(missionId, mediaHash))` as the on-chain key instead.

**G3 tests.**
- `test_verifySample_returnsFalse_forHashPaidInOtherMission`.
- `test_approve_sameHashInSecondMission_revertsAlreadyPaid` (documents the intended global rule).
- `test_paidInMission_setToMissionId`.

---

### F4 — MEDIUM — Cancel ↔ approve race

**Scenario.**
1. Contributor uploads; the backend sends `approveSubmission` (visible in the mempool).
2. Buyer sees the pending tx (or sees the submission in the dashboard) and sends `cancelMission` with a higher priority fee.
3. Cancel lands first → refund to buyer; the approval reverts `MissionNotActive` (and on Monad the verifier still pays gas, F7).
4. If the buyer could already see the media, the buyer keeps the work for free.

Reverse order (approve completes the mission, then cancel) is safe: cancel reverts, nothing to refund.

**Proposed change.**
- MVP minimum (backend rule, §8/§9): the buyer sees media **only after** on-chain approval is final.
  Then the race only loses unpaid, unseen work — acceptable and already listed in §9.
- Better (small contract change): two-step cancel.
  `requestCancel()` → status `Cancelling`, `cancelAfter = block.timestamp + CANCEL_DELAY` (e.g. 10 min);
  approvals still allowed while `Cancelling`; `cancelMission()` after the delay refunds the rest.
  Use `block.timestamp`, not block numbers (Monad block time differs from Ethereum).
- Backend: an approval that reverts with `MissionNotActive` → mark submission `mission_cancelled`, **no retry**.

**G3 tests.**
- `test_cancel_thenApprove_revertsMissionNotActive`.
- `test_approveCompletes_thenCancel_revertsMissionNotActive`.
- `test_cancel_refundsExactlyRemainingBudget` after k approvals (fuzz k).
- If two-step cancel is adopted: `test_approve_allowedDuringCancelDelay`, `test_cancel_beforeDelay_reverts`.
- `test_nonBuyer_cannotCancel`.

---

### F5 — MEDIUM — `anchorDataset` / `finalizeDataset` rules

**Issues.**
1. **One-time anchor, no correction.** A wrong root (backend bug, wrong leaf order, or a leaked key, F2) is permanent.
   The buyer can only refuse to `finalizeDataset`; the dataset can never be fixed.
2. **Root content is not bound.** The only on-chain check is `sampleCount == acceptedCount`. The tree can contain
   any hashes (unpaid ones, ones from other missions, duplicates). With F3's fix, `verifySample` protects third parties,
   but the anchored root itself can still be "wrong but with the right count".
3. `verifySample` returns `true` for anchored but **not finalized** datasets. Consumers may treat that as buyer-accepted.
4. Cancelled missions with `acceptedCount == 0` can never be anchored (`sampleCount > 0`). That is fine, but write it down.

**Proposed change.**
- Allow re-anchor **only while `!finalized`**: `anchorDataset` overwrites and emits `DatasetAnchored` again
  (or a separate `DatasetReanchored(missionId, oldRoot, newRoot)`). After `finalizeDataset` the root is frozen.
- Document in §5: "`verifySample == true` means *included and paid in this mission*; buyer acceptance is `getDataset().finalized`."
- `lib/monad/merkle.ts` (G6): reject duplicate leaves; build leaves only from this mission's `SubmissionApproved` events
  (read from chain, not from the DB).

**G3 tests.**
- `test_anchor_revertsWhileActive` (`MissionNotEnded`), `test_anchor_revertsOnZeroRoot`, `test_anchor_revertsOnCountMismatch`.
- `test_anchor_onCancelledMission_withAcceptedSamples_succeeds`.
- `test_reanchor_beforeFinalize_ok`, `test_reanchor_afterFinalize_reverts` (if adopted; else `test_anchor_twice_revertsAlreadyAnchored`).
- `test_finalize_onlyBuyer`, `test_finalize_revertsNotAnchored`, `test_finalize_twice_revertsAlreadyFinalized`.
- `test_nonVerifier_cannotAnchor`.

---

### F6 — MEDIUM — Privacy: public `contributor ↔ mediaHash` link

`SubmissionApproved(missionId, contributor, submissionHash, reward)` puts the raw SHA-256 of the media on a public chain,
next to the payout address. Anyone who has a copy of the file (e.g. a face photo, a voice sample) can prove which wallet
was paid for it. If the media is personal data, this is a KVKK/GDPR problem, and it is permanent (chain data cannot be deleted).

**Proposed change (§8).**
- On-chain key = `HMAC-SHA256(serverSecret, mediaBytes)` (or `keccak256(mediaHash ‖ serverSecret)`), not the raw file hash.
  It stays deterministic (global dedup still works) but cannot be computed by outsiders.
- The dataset manifest delivered to the buyer contains the on-chain keys, so `verifySample` still works for the buyer.
- The server secret is a new secret: env var only, never in the repo, never in logs.

**G3 tests:** none on-chain (contract only sees `bytes32`). G6 test: `mediaHashToBytes32` never equals the raw sha256.

---

### F7 — MEDIUM — Monad-specific operational risks

1. **Gas is billed on the limit, including for reverted txs.** Every lost race (F4), `AlreadyPaid` duplicate (F3) or
   `MissionNotActive` costs the full limit. `lib/monad` must: `eth_call` simulate → send only on success → tight limit
   (estimate × 1.15) → **cap** (F1) → no automatic retry of reverts.
2. **Async execution.** Monad orders txs in consensus and executes afterwards; `eth_call` on "latest" can lag the txs the
   verifier just sent. Consequences:
   - Use a local nonce manager (viem `nonceManager`) for bursts of approvals from one verifier key.
   - Dedup and "already approved?" checks come from the **DB (with a unique constraint on `media_hash`)**, not from a
     fresh on-chain read.
   - Mark a submission `paid` only after a successful receipt; use the receipt, not the send result.
3. **Reserve balance for the verifier.** The verifier sends value 0, so it never trips the 10 MON rule, but the consensus
   gas budget for in-flight txs is `min(10 MON, balance)`. With F1 unfixed, one griefing tx (3 MON limit) uses a large part of
   that budget and delays all other approvals.
4. **Timestamps.** Any delay logic (F4 two-step cancel) uses `block.timestamp` in seconds; do not count blocks.

**G3 tests:** run the suite with `network = "monad"` (gas numbers) and a testnet fork test, as G1 requires.
Add a gas snapshot (`forge snapshot`) for `approveSubmission` so G6 can set the cap from real numbers.

---

### F8 — LOW — `setFactory`

- **Front-run: not possible.** It is `onlyRole(DEFAULT_ADMIN_ROLE)`; a third party cannot call it. Before it is set,
  `factory == address(0)` and `msg.sender` is never zero, so `registerMission` is closed. Good.
- **Real risk:** a wrong address is permanent (one-time, not upgradeable). If it is set to an EOA by mistake, that EOA
  can call `registerMission` with **any `buyer`** → it could create missions whose cancel refunds go to a victim-chosen
  buyer address (low impact: the EOA funds them itself), and it breaks the "Factory is the only entry" rule.
- **Proposed change:** in `setFactory` require `factory_.code.length > 0` and `IMissionFactory(factory_).vault() == address(this)`.
  Or remove `setFactory` entirely: deploy the Factory first with the predicted Vault address
  (`vm.computeCreateAddress`) and pass `factory` to the Vault constructor as `immutable`.
- **G3 tests:** `test_setFactory_twice_reverts`, `test_setFactory_nonAdmin_reverts`, `test_setFactory_zero_reverts`,
  `test_setFactory_eoa_reverts` (if adopted), `test_registerMission_beforeSetFactory_reverts`, `test_registerMission_notFactory_reverts`.

### F9 — LOW — Invariant 1 can break with forced MON

`selfdestruct` (Cancun semantics still sends value) or block rewards can push MON into the Vault without `receive()`.
Then `balance == Σ remainingBudget` is false. **Change:** state the invariant as `>=`, and never use
`address(this).balance` in contract logic. **G3 test:** invariant handler that force-sends MON; the invariant still holds.

### F10 — LOW — Two role registries

Vault and Registry each have `VERIFIER_ROLE` and `DEFAULT_ADMIN_ROLE`. Revoking on one only leaves the other open.
**Change:** document in §2 + runbook; deploy script test asserts both grants; optionally one shared `AccessManager`
post-MVP. **G3 test:** deploy-script test `test_deploy_grantsVerifierOnBoth_andAdminIsExpected`.

### F11 — LOW — Reentrancy via the contributor callback

CEI + `nonReentrant` on `approveSubmission` and `cancelMission` is correct. Paths from the callback:
- into `cancelMission` / `withdraw` → blocked by the shared guard;
- into Factory → `registerMission`: harmless (state already updated). If `registerMission` gets `nonReentrant`,
  a contributor calling it would revert — with F1's fix that only defers the payout. Either way, **test it**;
- into Registry (`finalizeDataset`, view functions): Registry reads already-updated Vault state (no read-only reentrancy issue).
**G3 tests:** `test_reentrantContributor_cannotCancel`, `test_reentrantContributor_cannotDoubleApprove`,
`test_reentrantContributor_createMission_doesNotBreakInvariant`.

### F12 — LOW — Reserve balance for buyers

`createMission{value}` reverts at execution if the buyer's balance after value spend is below 10 MON, and the buyer still
pays the gas limit. **Change (G6/frontend):** pre-check `balance - value - gasLimit × maxFeePerGas >= 10 MON` and show a
clear message; map the revert to a readable error. Contract needs no change. Refunds (Vault → buyer) are contract
transfers and are not affected.

### F13 — INFO — `verifySample` / leaf format: correct

- `leaf = keccak256(bytes.concat(keccak256(abi.encode(h))))` matches OZ `StandardMerkleTree.of(values, ["bytes32"])`.
- Second preimage: internal nodes hash 64 bytes (sorted pair); leaves are a double hash of 32 bytes. An internal node
  cannot be presented as a leaf without a keccak preimage. Safe.
- Sorted-pair (commutative) hashing means a proof does not prove the position — fine, we only need membership.
- Single-leaf tree: root == leaf, empty proof works (`sampleCount = 1`).
- **Required:** return `false` early when the dataset is not anchored (root = 0), and the F3 per-mission paid check.
**G3 tests:** `test_verifySample_matchesStandardMerkleTreeFixture` (fixture JSON generated by `@openzeppelin/merkle-tree`,
shared with G6), `test_verifySample_rejectsInternalNodeAsLeaf`, `test_verifySample_notAnchored_false`,
`test_verifySample_wrongProof_false`, `test_verifySample_singleLeaf_emptyProof_true`.

### Other checks (no finding)

- `msg.value == reward * target`: checked arithmetic reverts on overflow; `MAX_TARGET` bounds it. Test: `test_register_overflow_reverts`.
- `remainingBudget` is exact (`reward × remaining`), no rounding dust.
- No `receive()` / `fallback()` on Vault and Factory: good (accidental sends revert).
- Mission IDs from the event, not predicted: correct for parallel buyers.

---

## 3. Suggested ARCHITECTURE.md edits (for the owner — I did not edit the file)

| Section | Edit |
|---|---|
| §2 Roles | Add `PAUSER_ROLE`; fix "Cannot move funds" wording (F2); separate admin key from buyer key |
| §3 State | `submissionPaid` → `paidInMission (bytes32 => uint256)`; add `pendingWithdrawals`; (opt.) `Cancelling` status |
| §3 Functions | Bounded-gas payout + pull fallback + `withdraw()`; `whenNotPaused`; (opt.) `requestCancel` |
| §3 Invariants | #1 → `balance >= Σ remainingBudget + Σ pendingWithdrawals` |
| §4 / setFactory | code + `vault()` check, or constructor-immutable factory |
| §5 Registry | re-anchor while `!finalized`; `verifySample` uses `paidInMission == missionId`, early `false` if not anchored; meaning of `true` |
| §6 Events | `PayoutDeferred`, `Withdrawn`, (opt.) `DatasetReanchored`, `CancelRequested` |
| §7 Errors | `NothingToWithdraw`, `EnforcedPause` (OZ), (opt.) `CancelDelayNotPassed` |
| §8 Mapping | on-chain key = keyed hash (F6); DB unique constraint on `media_hash`; buyer sees media only after approval |
| §9 Trust | rewrite "push payments" row (F1); add pause/runbook row (F2); add Monad gas-on-revert row (F7) |

## 4. G3 test checklist (consolidated)

Access: F2, F8, F10 tests · Payout safety: F1, F11 · Accounting: F9 invariants + overflow · Races: F4 ·
Dedup / provenance: F3, F5, F13 · Environment: `network = "monad"` run, fork test, `forge snapshot`.

---

## 5. Evidence

Design review only; the evidence is the document text:
```
$ git -C /d/dbforge status -sb   → ## feat/contracts...origin/feat/contracts   (git pull: Already up to date)
$ git -C /d/dbforge log --oneline -3
1c26978 docs(contracts): add contract architecture and Monad testnet research
0a3845a chore: initialize dbforge architecture
$ ls contracts/src contracts/test contracts/script   → all empty (no code to review yet)
```
Quoted sources: ARCHITECTURE.md §2 ("Cannot move funds"), §3 (`submissionPaid` GLOBAL, push `call`),
§5 (one-time anchor, `verifySample` uses `vault.submissionPaid`), §9 ("only that submission is affected");
tuna G1 report §Gas model ("charged on the gas LIMIT"), §Reserve Balance (10 MON, consensus gas budget `min(10 MON, balance)`),
§Other ("EIP-7702 delegated EOAs").

## 6. Changed files

- `contracts/docs/agent-results/TASK-MUI9LJK0MABPG-pelin-faz0.md` (this report). Not committed (task rule: no commit).

## 7. Risks

- If F1/F2 are not fixed before the testnet demo, one hostile contributor address can stop all payouts,
  and one leaked backend key can empty the Vault with no brake.
- F6 is irreversible once real personal media hashes are on-chain — decide before the first real submission.

## 8. Open questions (team / owner decision)

1. Pull-payment fallback (F1) — accept for MVP? (Recommended: yes.)
2. Pause + guardian key (F2) — who holds the guardian key?
3. Is the same file in two missions really forbidden (F3)?
4. Two-step cancel (F4), or only the backend rule "buyer sees media after approval"?
5. Re-anchor before finalize (F5) — accept?
6. Keyed hash for media (F6) — accept? It changes `lib/monad/format.ts` and the manifest format.

## 9. Next step

- Owner (tuna) decides on §8 and updates ARCHITECTURE.md; Nil adds the §4 tests in G3.
- Phase 1 (code review) when Nil's G3 is ready: check each finding against the code and the tests.

**Platform:** design review done on Windows 11 (Git Bash). No code was run; the findings are about Solidity/EVM design
and Monad network rules, so they are platform-independent. Foundry tests were not run (no code yet; Foundry was not
installed per G1).
