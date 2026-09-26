// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMissionVault} from "./IMissionVault.sol";

/// @notice Public entry point for buyers: creates and funds a mission in one transaction.
interface IMissionFactory {
    event MissionCreated(
        uint256 indexed missionId,
        address indexed buyer,
        uint256 rewardPerSubmission,
        uint256 targetCount,
        bytes32 metadataHash
    );

    function vault() external view returns (IMissionVault);

    function createMission(bytes32 metadataHash, uint256 rewardPerSubmission, uint256 targetCount)
        external
        payable
        returns (uint256 missionId);
}
