# DBForge Contracts — Architecture (MVP)

Owner: **Developer 2** (`contracts/`, `lib/monad/`)
Status: **DRAFT — waiting for team approval.** G3 (implementation) starts after approval.
Network: Monad Testnet. Chain id, RPC and compiler target are pinned after the G1 research report.

This document is the single source of truth for the contract interfaces.
If the implementation needs to differ, update this file first.

---

## 0. Network facts that shape the design (from G1)

Source: `agent-results/TASK-MUI9KOICNMZP8-tuna.md`.

- Monad Testnet, chain id **10143**, RPC `https://testnet-rpc.monad.xyz`, explorer https://testnet.monadvision.com.
- Foundry **≥ v1.8** with `network = "monad"` in `foundry.toml`. Solidity pinned to `0.8.28`.
- **Gas is charged on the gas limit, not on gas used.** `lib/monad` always sends an explicit, estimated gas limit.
- **Reserve balance (10 MON per EOA):** an EOA tx whose value spend drops the sender below 10 MON reverts.
  Buyers must keep ≥ 10 MON after funding a mission. The verifier sends no value, so it is not affected.
  Vault → contributor transfers are contract transfers and are not affected.

---

## 1. Overview

```
 Buyer wallet                         Backend (verifier hot wallet)
     │                                         │
     │ createMission{value}                    │ approveSubmission
     ▼                                         ▼
┌────────────────┐  registerMission  ┌──────────────────┐
│ MissionFactory │ ────────────────▶ │  MissionVault    │ ──▶ contributor (MON)
└────────────────┘     {value}       │  (all funds)     │ ──▶ buyer refund (cancel)
                                     └────────┬─────────┘
                                              │ getMission (read)
                                              ▼
 Buyer wallet ── finalizeDataset ──▶ ┌──────────────────┐ ◀── anchorDataset ── Backend
                                     │ProvenanceRegistry│
                                     └──────────────────┘
```

| Contract | Holds funds | Responsibility |
|---|---|---|
| `MissionFactory` | No (forwards) | Public entry point for buyers. Creates and funds a mission in **one transaction**. |
| `MissionVault` | **Yes** (all missions) | Mission state, per-sample payout, cancel + refund. |
| `ProvenanceRegistry` | No | Dataset anchoring (verifier) and dataset acceptance (buyer). |

Payment asset: native **MON** (testnet). All amounts are in **wei** (18 decimals).

---

## 2. Roles

| Role | Holder (MVP) | Can do |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Deployer (Developer 2's wallet) | Grant/revoke `VERIFIER_ROLE`; call `setFactory` once. **Cannot move funds.** |
| `VERIFIER_ROLE` | Backend hot wallet (small MON balance, gas only) | `approveSubmission` (Vault), `anchorDataset` (Registry). |
| Buyer | Whoever called `createMission` | `cancelMission` (own mission), `finalizeDataset` (own mission). |
| Factory | `MissionFactory` address | `registerMission` on the Vault. |

The Vault and the Registry each have their own `AccessControl`. The deploy script grants
`VERIFIER_ROLE` to the same verifier address on both.

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
    uint256 remainingBudget;       // wei, == reward * (target - accepted) while Active
    bytes32 metadataHash;
    MissionStatus status;
}

uint256 public nextMissionId;                  // starts at 1; 0 means "no mission"
address public factory;                         // set once
mapping(uint256 => Mission) internal missions;
mapping(bytes32 => bool) public submissionPaid; // GLOBAL: one media hash is paid at most once, ever
uint256 public constant MAX_TARGET = 100_000;
```

### Functions

```solidity
function setFactory(address factory_) external onlyRole(DEFAULT_ADMIN_ROLE);
// One time only. Reverts FactoryAlreadySet / ZeroAddress.

function registerMission(address buyer, bytes32 metadataHash, uint256 rewardPerSubmission, uint256 targetCount)
    external payable returns (uint256 missionId);
// Only `factory`. Checks: buyer != 0, metadataHash != 0, reward > 0,
// 0 < target <= MAX_TARGET, msg.value == reward * target.
// Status -> Active. Emits MissionFunded.

function approveSubmission(uint256 missionId, address contributor, bytes32 submissionHash)
    external onlyRole(VERIFIER_ROLE) nonReentrant;
// Checks: status == Active, contributor != 0, submissionHash != 0, !submissionPaid[hash].
// Effects (before transfer): submissionPaid = true, acceptedCount++, remainingBudget -= reward,
//   status -> Completed when acceptedCount == targetCount.
// Interaction: contributor.call{value: reward}(""); revert TransferFailed on failure.
// Emits SubmissionApproved, and MissionCompleted when the target is reached.

function cancelMission(uint256 missionId) external nonReentrant;
// Only the mission's buyer, only while Active.
// Effects: status -> Cancelled, remainingBudget -> 0. Interaction: refund buyer.
// Emits MissionCancelled.

function getMission(uint256 missionId) external view returns (Mission memory);
```

No `receive()` / `fallback()`: MON can only enter through `registerMission`.

### Invariants (fuzz-tested in G3)

1. `address(vault).balance == Σ remainingBudget` over all missions.
2. `acceptedCount <= targetCount`.
3. A given `submissionHash` is paid at most once.
4. A mission that is `Completed` or `Cancelled` never pays again.

---

## 4. MissionFactory

```solidity
IMissionVault public immutable vault;

function createMission(bytes32 metadataHash, uint256 rewardPerSubmission, uint256 targetCount)
    external payable returns (uint256 missionId);
// missionId = vault.registerMission{value: msg.value}(msg.sender, metadataHash, reward, target);
// Emits MissionCreated.
```

The Factory is a thin, stateless entry point. It exists to keep the buyer API stable
while fee logic and mission templates are added later (post-MVP).

---

## 5. ProvenanceRegistry

Decision (team, 2026-09-26): **only the verifier anchors; the buyer finalizes.**

```solidity
struct Dataset {
    bytes32 merkleRoot;
    bytes32 metadataHash;   // hash of the dataset manifest JSON
    uint256 sampleCount;
    uint64  anchoredAt;     // block timestamp; 0 = not anchored
    bool    finalized;
}

IMissionVault public immutable vault;
mapping(uint256 => Dataset) internal datasets;   // datasetId == missionId (one dataset per mission)

function anchorDataset(uint256 missionId, bytes32 merkleRoot, uint256 sampleCount, bytes32 metadataHash)
    external onlyRole(VERIFIER_ROLE);
// Checks: mission status is Completed or Cancelled; not anchored yet (one time);
// merkleRoot != 0; sampleCount > 0; sampleCount == mission.acceptedCount.
// Emits DatasetAnchored.

function finalizeDataset(uint256 missionId) external;
// Only the mission's buyer; dataset anchored; not finalized yet. Emits DatasetFinalized.

function verifySample(uint256 missionId, bytes32 submissionHash, bytes32[] calldata proof)
    external view returns (bool);
// true when the proof matches the anchored root AND vault.submissionPaid(submissionHash).

function getDataset(uint256 missionId) external view returns (Dataset memory);
```

### Merkle leaf format

Compatible with OpenZeppelin `StandardMerkleTree.of(values, ["bytes32"])`:

```
leaf = keccak256(bytes.concat(keccak256(abi.encode(submissionHash))))
```

Verified on-chain with OpenZeppelin `MerkleProof.verify`. `lib/monad/merkle.ts` builds the tree off-chain.

---

## 6. Events

```solidity
event MissionCreated(uint256 indexed missionId, address indexed buyer, uint256 rewardPerSubmission, uint256 targetCount, bytes32 metadataHash);
event MissionFunded(uint256 indexed missionId, address indexed buyer, uint256 amount);
event SubmissionApproved(uint256 indexed missionId, address indexed contributor, bytes32 indexed submissionHash, uint256 reward);
event MissionCompleted(uint256 indexed missionId, uint256 acceptedCount);
event MissionCancelled(uint256 indexed missionId, uint256 refunded);
event DatasetAnchored(uint256 indexed missionId, bytes32 merkleRoot, uint256 sampleCount, bytes32 metadataHash);
event DatasetFinalized(uint256 indexed missionId, address indexed buyer);
```

## 7. Custom errors

```solidity
error ZeroAddress();
error FactoryAlreadySet();
error OnlyFactory();
error InvalidReward();
error InvalidTarget();
error InvalidMetadata();
error IncorrectFunding(uint256 expected, uint256 actual);
error MissionNotActive(uint256 missionId);
error MissionNotEnded(uint256 missionId);
error NotBuyer(uint256 missionId);
error InvalidSubmission();
error AlreadyPaid(bytes32 submissionHash);
error TransferFailed();
error AlreadyAnchored(uint256 missionId);
error NotAnchored(uint256 missionId);
error AlreadyFinalized(uint256 missionId);
error SampleCountMismatch(uint256 expected, uint256 actual);
error InvalidRoot();
```

`lib/monad` maps these to readable messages for the backend and the frontend.

---

## 8. Off-chain ↔ on-chain mapping

| Off-chain (Supabase / API) | On-chain | Conversion (`lib/monad/format.ts`) |
|---|---|---|
| `missions.chain_mission_id` (bigint) | `missionId` (uint256) | `BigInt(value)` |
| `submissions.media_hash` (64 hex chars, **no** `0x`) | `submissionHash` (bytes32) | `mediaHashToBytes32`: validate `/^[0-9a-f]{64}$/i`, prefix `0x` |
| `missions.reward_mon` (numeric, MON) | `rewardPerSubmission` (wei) | `monToWei` / `weiToMon` (viem `parseEther` / `formatEther`) |
| `missions.metadata_hash` (**new column, proposed**) | `metadataHash` (bytes32) | `metadataHash({title, description, requirements})` |
| `submissions.tx_hash` | `SubmissionApproved` tx | returned by `settleSubmission` |

### `metadataHash` (proposal, needs team approval)

`keccak256(utf8(JSON.stringify(sortKeysDeep({ title, description, requirements }))))`.
`requirements` is a `string[]`; an empty array when there are none.

### Mission creation order

1. Frontend sends `createMission` from the buyer's wallet.
2. `missionId` is read from the `MissionCreated` event in the receipt.
3. `POST /api/missions` saves the DB row with `chain_mission_id`.

The chain comes first, so the DB never holds a mission that does not exist on-chain.

---

## 9. Trust model and known risks (MVP)

| Topic | MVP behaviour | Risk | Production direction |
|---|---|---|---|
| Verification authority | One backend key has `VERIFIER_ROLE`. | If the key leaks, an attacker can pay **remaining budgets of active missions** to addresses they choose, and anchor datasets. The attacker cannot withdraw to arbitrary targets through other paths, cannot change roles and cannot touch cancelled or completed missions. | Several verifiers + quorum, per-mission verifier sets, rate limits, challenge period. |
| Custody | Mission funds sit in the Vault, not in any EOA. Verifier wallet holds gas only. | Contract bug = funds at risk. **Not audited.** | External audit before mainnet. |
| Admin | Can only manage roles and set the factory once. | Admin can grant `VERIFIER_ROLE` to a bad key. | Multisig admin, timelock. |
| Push payments | Reward is sent directly to the contributor. | A contributor contract that rejects MON makes its own approval revert (only that submission is affected). | Pull-payment fallback. |
| Cancel race | Buyer can cancel at any time while Active. | Work done but not yet approved at cancel time is not paid. | Cancel delay / grace period for pending submissions. |
| Duplicate media | `submissionPaid` is global across missions. | Same file cannot be paid twice even in different missions (intended). | Perceptual-hash checks stay off-chain. |
| Asset | Native MON. | Volatile. | Stablecoin (ERC-20) payouts. |

Wording for the demo: **"production-oriented, not audited."**

---

## 10. Out of scope for the MVP

Fees, ERC-20 payouts, multi-verifier quorum, disputes, staking/slashing, upgradeability (proxies),
dataset licensing/royalties. Contracts are **not upgradeable**; a new version means a new deployment.
