# DBForge Contracts — Architecture (MVP) — v2

Owner: **Developer 2** (`contracts/`, `lib/monad/`)
Status: **v2 — approved decisions from the G4 phase-0 security review and the G6 v2 spec (2026-09-26).**
v1 (commit `1c26978`) is implemented in `fea50d3`. The v2 changes are implemented in **G3b**.
Network: Monad Testnet (chain id 10143).

This document is the single source of truth for the contract interfaces.
If the implementation needs to differ, update this file first.

### v2 changes at a glance

| # | Change | Source |
|---|---|---|
| 1 | **Pull payments.** `approveSubmission` no longer sends MON. It credits the contributor's balance; the contributor (or anyone, on their behalf) withdraws. | G4 F1, G6 spec |
| 2 | **Replay key is `(missionId, submissionHash)`**, not the hash alone. The same hash can be settled once per mission. | G6 spec (replaces G4 F3 proposal) |
| 3 | **Pausable** Vault and Registry, `PAUSER_ROLE`. Pause stops settlement and anchoring; cancel and withdraw stay open. | G4 F2 |
| 4 | New event `Settled` (replaces `SubmissionApproved`), new `Withdrawn`, settlement + balance views. | G6 spec |
| 5 | Re-anchor allowed until the buyer finalizes. | G4 F5 |
| 6 | `setFactory` checks that the target is a contract whose `vault()` is this Vault. | G4 F8 |
| 7 | Invariant: `balance >= Σ remainingBudget + Σ withdrawable` (forced MON can only add). | G4 F9 |
| — | Raw vs. salted media hash (privacy) — **deferred**, `TODO(F6)` in `lib/monad`. | G4 F6 |
| — | Cancel ↔ settle race — **no contract change**; backend rule: buyer sees media only after settlement. | G4 F4 |

---

## 0. Network facts that shape the design (from G1)

Source: `agent-results/TASK-MUI9KOICNMZP8-tuna.md`.

- Monad Testnet, chain id **10143**, RPC `https://testnet-rpc.monad.xyz`, explorer https://testnet.monadvision.com.
- Foundry **≥ v1.8** with `network = "monad"` in `foundry.toml`. Solidity pinned to `0.8.28`.
- **Gas is charged on the gas limit, not on gas used — also for reverted txs.** `lib/monad` simulates first,
  sends an explicit, estimated gas limit with a hard cap, and never auto-retries a revert.
- **Reserve balance (10 MON per EOA):** an EOA tx whose value spend drops the sender below 10 MON reverts.
  Buyers must keep ≥ 10 MON after funding a mission. The verifier sends no value. Contributors withdraw with value 0.

---

## 1. Overview

```
 Buyer wallet                         Backend (verifier hot wallet)
     │                                         │
     │ createMission{value}                    │ approveSubmission  (credits balance, no transfer)
     ▼                                         ▼
┌────────────────┐  registerMission  ┌──────────────────┐
│ MissionFactory │ ────────────────▶ │  MissionVault    │ ──▶ buyer refund (cancel)
└────────────────┘     {value}       │  (all funds)     │ ──▶ contributor MON on withdraw() / withdrawFor()
                                     └────────┬─────────┘
                                              │ getMission / getSettlement (read)
                                              ▼
 Buyer wallet ── finalizeDataset ──▶ ┌──────────────────┐ ◀── anchorDataset ── Backend
                                     │ProvenanceRegistry│
                                     └──────────────────┘
```

| Contract | Holds funds | Responsibility |
|---|---|---|
| `MissionFactory` | No (forwards) | Public entry point for buyers. Creates and funds a mission in **one transaction**. |
| `MissionVault` | **Yes** (budgets + unwithdrawn credits) | Mission state, per-sample settlement (credit), withdraw, cancel + refund, pause. |
| `ProvenanceRegistry` | No | Dataset anchoring (verifier), dataset acceptance (buyer), sample verification. |

Payment asset: native **MON** (testnet). All amounts are in **wei** (18 decimals).

---

## 2. Roles

| Role | Holder (MVP) | Can do |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Admin wallet — **not the buyer wallet** | Grant/revoke roles, `setFactory` once, `unpause`. Cannot move funds **directly**, but can grant `VERIFIER_ROLE`, which can credit active budgets. |
| `PAUSER_ROLE` | Admin + a guardian wallet | `pause()` on Vault and Registry. |
| `VERIFIER_ROLE` | Backend hot wallet (gas only, a few MON) | `approveSubmission` (Vault), `anchorDataset` (Registry). |
| Buyer | Whoever called `createMission` | `cancelMission`, `finalizeDataset` (own mission). |
| Contributor | Credited address | `withdraw()`. |
| Anyone | — | `withdrawFor(contributor)` — MON always goes to the contributor. |
| Factory | `MissionFactory` address | `registerMission` on the Vault. |

Vault and Registry each have their own `AccessControl`. The deploy script grants the same verifier and pauser
addresses on both, and a deploy test asserts it. **Key-leak runbook:** pause both → revoke on both → rotate key.

---

## 3. MissionVault

### State

```solidity
enum MissionStatus { None, Active, Completed, Cancelled }

struct Mission {
    address buyer;
    uint256 rewardPerSubmission;   // wei
    uint256 targetCount;
    uint256 acceptedCount;
    uint256 remainingBudget;       // wei, == reward * (target - accepted) while Active, 0 otherwise
    bytes32 metadataHash;
    MissionStatus status;
}

struct Settlement {
    address contributor;           // 0 = not settled
    uint256 amount;                // wei credited
}

bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");
uint256 public constant MAX_TARGET = 100_000;
uint256 public constant WITHDRAW_FOR_GAS = 50_000;   // gas stipend for withdrawFor

uint256 public nextMissionId;                                   // starts at 1
address public factory;                                         // set once
mapping(uint256 => Mission) internal missions;
mapping(uint256 => mapping(bytes32 => Settlement)) internal settlements;  // (missionId, hash)
mapping(address => uint256) public credited;                    // lifetime credited, wei
mapping(address => uint256) public withdrawn;                   // lifetime withdrawn, wei
```

`withdrawable(c) = credited[c] - withdrawn[c]`.

### Functions

```solidity
function setFactory(address factory_) external onlyRole(DEFAULT_ADMIN_ROLE);
// One time. Reverts FactoryAlreadySet / ZeroAddress / InvalidFactory
// (InvalidFactory when factory_ has no code or IMissionFactory(factory_).vault() != address(this)).

function registerMission(address buyer, bytes32 metadataHash, uint256 rewardPerSubmission, uint256 targetCount)
    external payable returns (uint256 missionId);
// Only `factory`. Unchanged from v1. Emits MissionFunded.

function approveSubmission(uint256 missionId, address contributor, bytes32 submissionHash)
    external onlyRole(VERIFIER_ROLE) whenNotPaused;
// Checks: status == Active, contributor != 0, submissionHash != 0,
//         settlements[missionId][submissionHash].contributor == 0  (else AlreadySettled).
// Effects: settlements[missionId][hash] = (contributor, reward); credited[contributor] += reward;
//          acceptedCount++; remainingBudget -= reward; Completed at target.
// NO external call. Bounded gas regardless of who the contributor is.
// Emits Settled, and MissionCompleted when the target is reached.

function withdraw() external nonReentrant;
// Sends withdrawable(msg.sender) to msg.sender (all gas forwarded, returndata not copied).
// Reverts NothingToWithdraw when 0, TransferFailed when the call fails. Emits Withdrawn.
// Works while paused.

function withdrawFor(address contributor) external nonReentrant;
// Anyone may call; MON goes ONLY to `contributor`. Call uses WITHDRAW_FOR_GAS and does not copy returndata.
// Reverts NothingToWithdraw / TransferFailed. Emits Withdrawn.
// Purpose: a new contributor wallet with 0 MON cannot pay gas for withdraw(); the backend or a helper pays it.
// Works while paused.

function cancelMission(uint256 missionId) external nonReentrant;
// Unchanged from v1: only the buyer, only while Active, refunds remainingBudget. Works while paused.

function pause() external onlyRole(PAUSER_ROLE);
function unpause() external onlyRole(DEFAULT_ADMIN_ROLE);

function getMission(uint256 missionId) external view returns (Mission memory);
function getSettlement(uint256 missionId, bytes32 submissionHash)
    external view returns (bool settled, address contributor, uint256 amount);
function getContributorBalance(address contributor)
    external view returns (uint256 credited, uint256 withdrawn, uint256 withdrawable);
```

No `receive()` / `fallback()`.

### Invariants (fuzz-tested)

1. `address(vault).balance >= Σ remainingBudget + Σ withdrawable` (forced MON can only add; never read `balance` in logic).
2. Conservation: `funded == Σ remainingBudget + Σ credited + refunded`, and `Σ credited == Σ withdrawn + Σ withdrawable`.
3. `acceptedCount <= targetCount`; `remainingBudget == reward × (target − accepted)` while Active, 0 otherwise.
4. A `(missionId, hash)` pair is settled at most once.
5. An ended mission never settles again.
6. `withdrawn[c] <= credited[c]` for every contributor.

---

## 4. MissionFactory

Unchanged from v1. Exposes `vault()` (used by `setFactory`'s check).

```solidity
IMissionVault public immutable vault;
function createMission(bytes32 metadataHash, uint256 rewardPerSubmission, uint256 targetCount)
    external payable returns (uint256 missionId);   // emits MissionCreated
```

---

## 5. ProvenanceRegistry

Decision: **only the verifier anchors; the buyer finalizes.** datasetId == missionId.

```solidity
struct Dataset {
    bytes32 merkleRoot;
    bytes32 metadataHash;   // hash of the dataset manifest JSON
    uint256 sampleCount;
    uint64  anchoredAt;     // timestamp of the latest anchor; 0 = never anchored
    bool    finalized;
}

function anchorDataset(uint256 missionId, bytes32 merkleRoot, uint256 sampleCount, bytes32 metadataHash)
    external onlyRole(VERIFIER_ROLE) whenNotPaused;
// Checks: mission Completed or Cancelled; NOT finalized (re-anchor allowed until finalize);
// merkleRoot != 0; sampleCount > 0; sampleCount == mission.acceptedCount.
// Emits DatasetAnchored (every anchor, including re-anchors; `previousRoot` is 0 on the first one).

function finalizeDataset(uint256 missionId) external;
// Only the mission's buyer; anchored; not finalized. Freezes the root. Emits DatasetFinalized.

function verifySample(uint256 missionId, bytes32 submissionHash, bytes32[] calldata proof)
    external view returns (bool);
// false early when not anchored. true when the proof matches the root AND
// vault.getSettlement(missionId, submissionHash).settled — i.e. "included and settled in THIS mission".
// Buyer acceptance is a separate fact: getDataset(missionId).finalized.

function pause() external onlyRole(PAUSER_ROLE);
function unpause() external onlyRole(DEFAULT_ADMIN_ROLE);
function getDataset(uint256 missionId) external view returns (Dataset memory);
```

Merkle leaf (OpenZeppelin `StandardMerkleTree.of(values, ["bytes32"])`, verified by `MerkleProof`):
`leaf = keccak256(bytes.concat(keccak256(abi.encode(submissionHash))))`.
`lib/monad/merkle.ts` builds leaves from this mission's `Settled` events (read from chain), rejects duplicates.

---

## 6. Events

```solidity
event MissionCreated(uint256 indexed missionId, address indexed buyer, uint256 rewardPerSubmission, uint256 targetCount, bytes32 metadataHash);
event MissionFunded(uint256 indexed missionId, address indexed buyer, uint256 amount);
event Settled(uint256 indexed missionId, bytes32 indexed submissionHash, address indexed contributor, uint256 amount);
event Withdrawn(address indexed contributor, uint256 amount);
event MissionCompleted(uint256 indexed missionId, uint256 acceptedCount);
event MissionCancelled(uint256 indexed missionId, uint256 refunded);
event DatasetAnchored(uint256 indexed missionId, bytes32 merkleRoot, bytes32 previousRoot, uint256 sampleCount, bytes32 metadataHash);
event DatasetFinalized(uint256 indexed missionId, address indexed buyer);
// + OpenZeppelin Paused(address) / Unpaused(address), RoleGranted / RoleRevoked
```

`SubmissionApproved` (v1) is removed; `Settled` replaces it.

## 7. Custom errors

v1 list, with these changes:
- removed: `AlreadyPaid(bytes32)`, `AlreadyAnchored(uint256)`
- added: `AlreadySettled(uint256 missionId, bytes32 submissionHash)`, `NothingToWithdraw()`, `InvalidFactory()`
- from OpenZeppelin: `EnforcedPause()`, `ExpectedPause()`, `AccessControlUnauthorizedAccount(address,bytes32)`

`lib/monad` maps them to its typed error codes (see the G6 README).

---

## 8. Off-chain ↔ on-chain mapping

| Off-chain (Supabase / API) | On-chain | Conversion (`lib/monad`) |
|---|---|---|
| `missions.chain_mission_id` (bigint) | `missionId` (uint256) | `BigInt(value)` |
| `submissionHash` passed to `settleSubmission` — **`0x` + 64 hex** (the backend adds `0x` to its SHA-256) | `submissionHash` (bytes32) | validated `/^0x[0-9a-fA-F]{64}$/`; `TODO(F6)`: salted commitment may replace the raw hash later, inside `lib/monad` only |
| `missions.reward_mon` (numeric, MON) | `rewardPerSubmission` (wei) | viem `parseEther` / `formatEther`; amounts returned as **wei strings** |
| `missions.metadata_hash` (**new column, requested from Developer 3**) | `metadataHash` (bytes32) | `metadataHash({title, description, requirements})` = keccak256 of sorted-key JSON |
| `submissions.tx_hash` | `Settled` tx | returned by `settleSubmission` |

**Status semantics:** `settled` = credited to the contributor's on-chain balance. MON leaves the Vault only on
`withdraw` / `withdrawFor`. Track withdrawals with `getContributorBalance` or `Withdrawn` events.

**Off-chain rules that the contracts rely on (Developer 3):**
- Off-chain dedup of media across missions (same file in two missions is now allowed on-chain).
- The buyer sees a submission's media only after it is settled (G4 F4).
- Mission creation order: chain first (`createMission` → read `missionId` from `MissionCreated`) → then `POST /api/missions`.

---

## 9. Trust model and known risks (MVP)

| Topic | MVP behaviour | Risk | Production direction |
|---|---|---|---|
| Verification authority | One backend key has `VERIFIER_ROLE`. | Leaked key → attacker can credit active budgets to own addresses and anchor fake roots on ended, unfinalized missions. **Brake:** `pause()` by admin or guardian; cancel and withdraw stay open. | Several verifiers + quorum, rate limits, challenge period. |
| Admin | Roles, one-time factory, unpause. | Admin can grant `VERIFIER_ROLE` to a bad key. Admin key ≠ buyer key. | Multisig, `AccessControlDefaultAdminRules`, timelock. |
| Custody | Budgets and unwithdrawn credits sit in the Vault. Verifier holds gas only. | Contract bug = funds at risk. **Not audited.** | External audit before mainnet. |
| Payouts | Pull model: settlement credits, withdraw sends. | Settlement gas is bounded; a hostile contributor can only block its own withdrawal. | — |
| Gas on Monad | Charged on gas limit, also for reverts. | Lost races and duplicates cost full gas. `lib/monad`: simulate → cap → no auto-retry. | — |
| Cancel race | Buyer can cancel any time while Active. | Unsettled work is not paid. Mitigated off-chain (buyer sees media only after settlement). | Two-step cancel with delay. |
| Privacy | Raw media hash on-chain next to the payout address. | Linkable if the media is personal data. **Deferred (F6).** | Salted/keyed commitment. |
| Asset | Native MON. | Volatile. | Stablecoin (ERC-20). |

Wording for the demo: **"production-oriented, not audited."**

---

## 10. Out of scope for the MVP

Fees, ERC-20 payouts, multi-verifier quorum, disputes, two-step cancel, staking/slashing, upgradeability,
dataset licensing/royalties. Contracts are **not upgradeable**; a new version means a new deployment.
