// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMissionVault} from "./interfaces/IMissionVault.sol";
import {
    ZeroAddress,
    FactoryAlreadySet,
    OnlyFactory,
    InvalidReward,
    InvalidTarget,
    InvalidMetadata,
    IncorrectFunding,
    MissionNotActive,
    NotBuyer,
    InvalidSubmission,
    AlreadyPaid,
    TransferFailed
} from "./Errors.sol";

/// @title MissionVault
/// @notice Holds the MON of every mission. Pays contributors per approved sample and refunds
///         buyers on cancel. MON can only enter through `registerMission` (no receive/fallback).
/// @dev Production-oriented, not audited. See docs/ARCHITECTURE.md §3 and §9.
contract MissionVault is IMissionVault, AccessControl, ReentrancyGuard {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    uint256 public constant MAX_TARGET = 100_000;

    /// @notice Id of the next mission. Starts at 1; 0 means "no mission".
    uint256 public nextMissionId = 1;
    address public factory;
    mapping(uint256 => Mission) internal missions;
    /// @notice Global: one submission hash is paid at most once, across all missions.
    mapping(bytes32 => bool) public submissionPaid;

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Sets the factory once. The admin cannot change it afterwards.
    function setFactory(address factory_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (factory != address(0)) revert FactoryAlreadySet();
        if (factory_ == address(0)) revert ZeroAddress();
        // No event: ARCHITECTURE.md §6 defines none, and the value can be set only once.
        // forge-lint: disable-next-line(missing-events-access-control)
        factory = factory_;
    }

    /// @notice Creates an Active mission funded with exactly `reward * target` wei.
    function registerMission(address buyer, bytes32 metadataHash, uint256 rewardPerSubmission, uint256 targetCount)
        external
        payable
        returns (uint256 missionId)
    {
        if (msg.sender != factory) revert OnlyFactory();
        if (buyer == address(0)) revert ZeroAddress();
        if (metadataHash == bytes32(0)) revert InvalidMetadata();
        if (rewardPerSubmission == 0) revert InvalidReward();
        if (targetCount == 0 || targetCount > MAX_TARGET) revert InvalidTarget();
        uint256 budget = rewardPerSubmission * targetCount;
        if (msg.value != budget) revert IncorrectFunding(budget, msg.value);

        missionId = nextMissionId++;
        missions[missionId] = Mission({
            buyer: buyer,
            rewardPerSubmission: rewardPerSubmission,
            targetCount: targetCount,
            acceptedCount: 0,
            remainingBudget: budget,
            metadataHash: metadataHash,
            status: MissionStatus.Active
        });

        emit MissionFunded(missionId, buyer, budget);
    }

    /// @notice Pays one reward for an approved submission. Completes the mission at its target.
    function approveSubmission(uint256 missionId, address contributor, bytes32 submissionHash)
        external
        nonReentrant
        onlyRole(VERIFIER_ROLE)
    {
        Mission storage m = missions[missionId];
        if (m.status != MissionStatus.Active) revert MissionNotActive(missionId);
        if (contributor == address(0)) revert ZeroAddress();
        if (submissionHash == bytes32(0)) revert InvalidSubmission();
        if (submissionPaid[submissionHash]) revert AlreadyPaid(submissionHash);

        uint256 reward = m.rewardPerSubmission;
        submissionPaid[submissionHash] = true;
        uint256 accepted = ++m.acceptedCount;
        m.remainingBudget -= reward;
        bool completed = accepted == m.targetCount;
        if (completed) m.status = MissionStatus.Completed;

        emit SubmissionApproved(missionId, contributor, submissionHash, reward);
        if (completed) emit MissionCompleted(missionId, accepted);

        _sendValue(contributor, reward);
    }

    /// @notice Cancels an Active mission and refunds the unspent budget to its buyer.
    function cancelMission(uint256 missionId) external nonReentrant {
        Mission storage m = missions[missionId];
        if (msg.sender != m.buyer) revert NotBuyer(missionId);
        if (m.status != MissionStatus.Active) revert MissionNotActive(missionId);

        uint256 refund = m.remainingBudget;
        m.status = MissionStatus.Cancelled;
        m.remainingBudget = 0;

        emit MissionCancelled(missionId, refund);

        _sendValue(msg.sender, refund);
    }

    function getMission(uint256 missionId) external view returns (Mission memory) {
        return missions[missionId];
    }

    /// @dev Callers are `nonReentrant` and update state first. `to` is the verifier-chosen
    ///      contributor or the mission's own buyer, never an arbitrary caller-supplied address.
    ///      Assembly so that returndata is never copied: a receiver returning a huge blob
    ///      ("return bomb") cannot inflate the verifier's gas.
    function _sendValue(address to, uint256 amount) private {
        bool ok;
        assembly ("memory-safe") {
            ok := call(gas(), to, amount, 0, 0, 0, 0)
        }
        if (!ok) revert TransferFailed();
    }
}
