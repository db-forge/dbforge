// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMissionVault} from "./IMissionVault.sol";

/// @notice Dataset anchoring (verifier) and dataset acceptance (buyer). datasetId == missionId.
interface IProvenanceRegistry {
    struct Dataset {
        bytes32 merkleRoot;
        bytes32 metadataHash; // hash of the dataset manifest JSON
        uint256 sampleCount;
        uint64 anchoredAt; // timestamp of the latest anchor; 0 = never anchored
        bool finalized;
    }

    event DatasetAnchored(
        uint256 indexed missionId, bytes32 merkleRoot, bytes32 previousRoot, uint256 sampleCount, bytes32 metadataHash
    );
    event DatasetFinalized(uint256 indexed missionId, address indexed buyer);

    function vault() external view returns (IMissionVault);

    function anchorDataset(uint256 missionId, bytes32 merkleRoot, uint256 sampleCount, bytes32 metadataHash) external;

    /// @param expectedRoot The root the buyer reviewed. Reverts RootMismatch if a re-anchor changed it.
    function finalizeDataset(uint256 missionId, bytes32 expectedRoot) external;

    function pause() external;

    function unpause() external;

    function verifySample(uint256 missionId, bytes32 submissionHash, bytes32[] calldata proof)
        external
        view
        returns (bool);

    function getDataset(uint256 missionId) external view returns (Dataset memory);
}
