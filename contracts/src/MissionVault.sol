// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMissionVault} from "./interfaces/IMissionVault.sol";
import {IMissionFactory} from "./interfaces/IMissionFactory.sol";
import {
    ZeroAddress,
    FactoryAlreadySet,
    InvalidFactory,
    OnlyFactory,
    InvalidReward,
    InvalidTarget,
    InvalidMetadata,
    IncorrectFunding,
    MissionNotActive,
    NotBuyer,
    InvalidSubmission,
    AlreadySettled,
    NothingToWithdraw,
    TransferFailed
} from "./Errors.sol";

/// @title MissionVault
/// @notice Holds the MON of every mission. Settlement credits the contributor (no transfer);
///         contributors pull with `withdraw`, or anyone pushes it to them with `withdrawFor`.
///         Buyers get the unspent budget back on cancel. MON can only enter through
///         `registerMission` (no receive/fallback).
/// @dev Production-oriented, not audited. See docs/ARCHITECTURE.md §3 and §9.
contract MissionVault is IMissionVault, AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint256 public constant MAX_TARGET = 100_000;
    /// @notice Gas forwarded to the contributor by `withdrawFor`, so a helper paying the gas cannot be griefed.
    uint256 public constant WITHDRAW_FOR_GAS = 50_000;

    /// @notice Id of the next mission. Starts at 1; 0 means "no mission".
    uint256 public nextMissionId = 1;
    address public factory;
    mapping(uint256 => Mission) internal missions;
    /// @dev Replay key is (missionId, submissionHash): one hash settles at most once per mission.
    mapping(uint256 => mapping(bytes32 => Settlement)) internal settlements;
    /// @notice Lifetime credited wei per contributor.
    mapping(address => uint256) public credited;
    /// @notice Lifetime withdrawn wei per contributor. withdrawable = credited - withdrawn.
    mapping(address => uint256) public withdrawn;

    /// @dev The admin also gets PAUSER_ROLE, so the brake exists from the first block.
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    /// @notice Sets the factory once. It must be a contract whose `vault()` is this Vault.
    function setFactory(address factory_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (factory != address(0)) revert FactoryAlreadySet();
        if (factory_ == address(0)) revert ZeroAddress();
        if (factory_.code.length == 0) revert InvalidFactory();
        (bool ok, bytes memory ret) = factory_.staticcall(abi.encodeCall(IMissionFactory.vault, ()));
        // Decode as uint256 so that a malformed answer (short, or dirty upper bits) is InvalidFactory, not a panic.
        if (!ok || ret.length != 32 || abi.decode(ret, (uint256)) != uint256(uint160(address(this)))) {
            revert InvalidFactory();
        }
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

    /// @notice Settles one approved submission: credits one reward to `contributor`. Completes the mission
    ///         at its target. Makes no external call, so its gas does not depend on the contributor.
    function approveSubmission(uint256 missionId, address contributor, bytes32 submissionHash)
        external
        onlyRole(VERIFIER_ROLE)
        whenNotPaused
    {
        Mission storage m = missions[missionId];
        if (m.status != MissionStatus.Active) revert MissionNotActive(missionId);
        if (contributor == address(0)) revert ZeroAddress();
        if (submissionHash == bytes32(0)) revert InvalidSubmission();
        Settlement storage s = settlements[missionId][submissionHash];
        if (s.contributor != address(0)) revert AlreadySettled(missionId, submissionHash);

        uint256 reward = m.rewardPerSubmission;
        s.contributor = contributor;
        s.amount = reward;
        credited[contributor] += reward;
        uint256 accepted = ++m.acceptedCount;
        m.remainingBudget -= reward;
        bool completed = accepted == m.targetCount;
        if (completed) m.status = MissionStatus.Completed;

        emit Settled(missionId, submissionHash, contributor, reward);
        if (completed) emit MissionCompleted(missionId, accepted);
    }

    /// @notice Sends the caller's whole withdrawable balance to the caller (all gas forwarded). Open while paused.
    function withdraw() external nonReentrant {
        _withdraw(msg.sender, gasleft());
    }

    /// @notice Anyone may pay the gas; the MON goes only to `contributor`, with a WITHDRAW_FOR_GAS stipend.
    ///         Open while paused.
    function withdrawFor(address contributor) external nonReentrant {
        _withdraw(contributor, WITHDRAW_FOR_GAS);
    }

    /// @notice Cancels an Active mission and refunds the unspent budget to its buyer. Open while paused.
    function cancelMission(uint256 missionId) external nonReentrant {
        Mission storage m = missions[missionId];
        if (msg.sender != m.buyer) revert NotBuyer(missionId);
        if (m.status != MissionStatus.Active) revert MissionNotActive(missionId);

        uint256 refund = m.remainingBudget;
        m.status = MissionStatus.Cancelled;
        m.remainingBudget = 0;

        emit MissionCancelled(missionId, refund);

        _sendValue(msg.sender, refund, gasleft());
    }

    /// @notice Stops settlement. Cancel and withdraw stay open.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function getMission(uint256 missionId) external view returns (Mission memory) {
        return missions[missionId];
    }

    function getSettlement(uint256 missionId, bytes32 submissionHash)
        external
        view
        returns (bool settled, address contributor, uint256 amount)
    {
        Settlement storage s = settlements[missionId][submissionHash];
        return (s.contributor != address(0), s.contributor, s.amount);
    }

    function getContributorBalance(address contributor) external view returns (uint256, uint256, uint256) {
        uint256 c = credited[contributor];
        uint256 w = withdrawn[contributor];
        return (c, w, c - w);
    }

    /// @dev Callers are `nonReentrant`. State is updated before the transfer.
    function _withdraw(address contributor, uint256 gasLimit) private {
        uint256 amount = credited[contributor] - withdrawn[contributor];
        if (amount == 0) revert NothingToWithdraw();
        withdrawn[contributor] += amount;

        emit Withdrawn(contributor, amount);

        _sendValue(contributor, amount, gasLimit);
    }

    /// @dev Assembly so that returndata is never copied: a receiver returning a huge blob
    ///      ("return bomb") cannot inflate the caller's gas. A failed transfer reverts the whole call.
    function _sendValue(address to, uint256 amount, uint256 gasLimit) private {
        bool ok;
        assembly ("memory-safe") {
            ok := call(gasLimit, to, amount, 0, 0, 0, 0)
        }
        if (!ok) revert TransferFailed();
    }
}
