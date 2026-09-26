// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMissionVault} from "./interfaces/IMissionVault.sol";
import {IMissionFactory} from "./interfaces/IMissionFactory.sol";
import {ZeroAddress} from "./Errors.sol";

/// @title MissionFactory
/// @notice Thin, stateless entry point for buyers. Creates and funds a mission in one transaction;
///         the Vault holds the funds and validates every parameter.
/// @dev Production-oriented, not audited. See docs/ARCHITECTURE.md §4.
contract MissionFactory is IMissionFactory {
    IMissionVault public immutable vault;

    constructor(IMissionVault vault_) {
        if (address(vault_) == address(0)) revert ZeroAddress();
        vault = vault_;
    }

    function createMission(bytes32 metadataHash, uint256 rewardPerSubmission, uint256 targetCount)
        external
        payable
        returns (uint256 missionId)
    {
        missionId = vault.registerMission{value: msg.value}(msg.sender, metadataHash, rewardPerSubmission, targetCount);
        // The id comes from the (immutable, trusted) Vault, so the event must follow the call.
        // forge-lint: disable-next-line(reentrancy-events)
        emit MissionCreated(missionId, msg.sender, rewardPerSubmission, targetCount, metadataHash);
    }
}
