// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Holds the MON of every mission and pays contributors per accepted sample.
interface IMissionVault {
    enum MissionStatus {
        None,
        Active,
        Completed,
        Cancelled
    }

    struct Mission {
        address buyer;
        uint256 rewardPerSubmission; // wei
        uint256 targetCount;
        uint256 acceptedCount;
        uint256 remainingBudget; // wei, == reward * (target - accepted) while Active
        bytes32 metadataHash;
        MissionStatus status;
    }

    event MissionFunded(uint256 indexed missionId, address indexed buyer, uint256 amount);
    event SubmissionApproved(
        uint256 indexed missionId, address indexed contributor, bytes32 indexed submissionHash, uint256 reward
    );
    event MissionCompleted(uint256 indexed missionId, uint256 acceptedCount);
    event MissionCancelled(uint256 indexed missionId, uint256 refunded);

    function setFactory(address factory_) external;

    function registerMission(address buyer, bytes32 metadataHash, uint256 rewardPerSubmission, uint256 targetCount)
        external
        payable
        returns (uint256 missionId);

    function approveSubmission(uint256 missionId, address contributor, bytes32 submissionHash) external;

    function cancelMission(uint256 missionId) external;

    function getMission(uint256 missionId) external view returns (Mission memory);

    function submissionPaid(bytes32 submissionHash) external view returns (bool);

    function nextMissionId() external view returns (uint256);

    function factory() external view returns (address);
}
