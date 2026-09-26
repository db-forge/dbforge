// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IMissionVault} from "./interfaces/IMissionVault.sol";
import {IProvenanceRegistry} from "./interfaces/IProvenanceRegistry.sol";
import {
    ZeroAddress,
    MissionNotEnded,
    NotBuyer,
    NotAnchored,
    AlreadyFinalized,
    SampleCountMismatch,
    InvalidRoot,
    InvalidMetadata,
    RootMismatch
} from "./Errors.sol";

/// @title ProvenanceRegistry
/// @notice The verifier anchors the dataset Merkle root of an ended mission (and may re-anchor it until
///         the buyer finalizes); the mission's buyer finalizes (accepts) it. datasetId == missionId.
/// @dev Leaf = keccak256(bytes.concat(keccak256(abi.encode(submissionHash)))), compatible with
///      OpenZeppelin StandardMerkleTree.of(values, ["bytes32"]). Not audited.
contract ProvenanceRegistry is IProvenanceRegistry, AccessControl, Pausable {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    IMissionVault public immutable vault;
    mapping(uint256 => Dataset) internal datasets;

    /// @dev The admin also gets PAUSER_ROLE, so the brake exists from the first block.
    constructor(address admin, IMissionVault vault_) {
        if (admin == address(0) || address(vault_) == address(0)) revert ZeroAddress();
        vault = vault_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    /// @notice Anchors (or re-anchors, until finalized) the dataset of a Completed or Cancelled mission.
    function anchorDataset(uint256 missionId, bytes32 merkleRoot, uint256 sampleCount, bytes32 metadataHash)
        external
        onlyRole(VERIFIER_ROLE)
        whenNotPaused
    {
        IMissionVault.Mission memory m = vault.getMission(missionId);
        if (m.status != IMissionVault.MissionStatus.Completed && m.status != IMissionVault.MissionStatus.Cancelled) {
            revert MissionNotEnded(missionId);
        }
        Dataset storage d = datasets[missionId];
        if (d.finalized) revert AlreadyFinalized(missionId);
        if (merkleRoot == bytes32(0)) revert InvalidRoot();
        if (metadataHash == bytes32(0)) revert InvalidMetadata();
        if (sampleCount == 0 || sampleCount != m.acceptedCount) {
            revert SampleCountMismatch(m.acceptedCount, sampleCount);
        }

        bytes32 previousRoot = d.merkleRoot;
        d.merkleRoot = merkleRoot;
        d.metadataHash = metadataHash;
        d.sampleCount = sampleCount;
        // uint64 seconds overflow in ~584 billion years.
        // forge-lint: disable-next-line(unsafe-typecast)
        d.anchoredAt = uint64(block.timestamp);

        emit DatasetAnchored(missionId, merkleRoot, previousRoot, sampleCount, metadataHash);
    }

    /// @notice The mission's buyer accepts the anchored dataset. Freezes the root. One time only.
    /// @param expectedRoot The root the buyer reviewed. A re-anchor that lands first makes this revert
    ///        instead of freezing a root the buyer never saw (G4 M-1).
    function finalizeDataset(uint256 missionId, bytes32 expectedRoot) external {
        if (msg.sender != vault.getMission(missionId).buyer) revert NotBuyer(missionId);
        Dataset storage d = datasets[missionId];
        if (d.anchoredAt == 0) revert NotAnchored(missionId);
        if (d.finalized) revert AlreadyFinalized(missionId);
        if (d.merkleRoot != expectedRoot) revert RootMismatch(missionId, expectedRoot, d.merkleRoot);

        d.finalized = true;

        emit DatasetFinalized(missionId, msg.sender);
    }

    /// @notice Stops anchoring. Finalize and verify stay open.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice True when `proof` links `submissionHash` to the anchored root AND the Vault settled that hash
    ///         in THIS mission. Buyer acceptance is a separate fact: `getDataset(missionId).finalized`.
    function verifySample(uint256 missionId, bytes32 submissionHash, bytes32[] calldata proof)
        external
        view
        returns (bool)
    {
        Dataset storage d = datasets[missionId];
        if (d.anchoredAt == 0) return false;
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(submissionHash))));
        if (!MerkleProof.verifyCalldata(proof, d.merkleRoot, leaf)) return false;
        // Only the `settled` flag matters here; contributor and amount are for off-chain readers.
        // forge-lint: disable-next-line(unused-return)
        (bool settled,,) = vault.getSettlement(missionId, submissionHash);
        return settled;
    }

    function getDataset(uint256 missionId) external view returns (Dataset memory) {
        return datasets[missionId];
    }
}
