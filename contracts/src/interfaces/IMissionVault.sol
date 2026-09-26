// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Holds the MON of every mission. Settlement credits contributors; they withdraw (pull payments).
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
        uint256 remainingBudget; // wei, == reward * (target - accepted) while Active, 0 otherwise
        bytes32 metadataHash;
        MissionStatus status;
    }

    struct Settlement {
        address contributor; // 0 = not settled
        uint256 amount; // wei credited
    }

    event MissionFunded(uint256 indexed missionId, address indexed buyer, uint256 amount);
    event Settled(
        uint256 indexed missionId, bytes32 indexed submissionHash, address indexed contributor, uint256 amount
    );
    event Withdrawn(address indexed contributor, uint256 amount);
    event MissionCompleted(uint256 indexed missionId, uint256 acceptedCount);
    event MissionCancelled(uint256 indexed missionId, uint256 refunded);

    function setFactory(address factory_) external;

    function registerMission(address buyer, bytes32 metadataHash, uint256 rewardPerSubmission, uint256 targetCount)
        external
        payable
        returns (uint256 missionId);

    function approveSubmission(uint256 missionId, address contributor, bytes32 submissionHash) external;

    function withdraw() external;

    function withdrawFor(address contributor) external;

    function cancelMission(uint256 missionId) external;

    function pause() external;

    function unpause() external;

    function getMission(uint256 missionId) external view returns (Mission memory);

    function getSettlement(uint256 missionId, bytes32 submissionHash)
        external
        view
        returns (bool settled, address contributor, uint256 amount);

    function getContributorBalance(address contributor)
        external
        view
        returns (uint256 credited, uint256 withdrawn, uint256 withdrawable);

    function credited(address contributor) external view returns (uint256);

    function withdrawn(address contributor) external view returns (uint256);

    function nextMissionId() external view returns (uint256);

    function factory() external view returns (address);
}
