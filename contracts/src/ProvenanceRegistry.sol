// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IMissionVault} from "./interfaces/IMissionVault.sol";
import {IProvenanceRegistry} from "./interfaces/IProvenanceRegistry.sol";
import {
    ZeroAddress,
    MissionNotEnded,
    NotBuyer,
    AlreadyAnchored,
    NotAnchored,
    AlreadyFinalized,
    SampleCountMismatch,
    InvalidRoot
} from "./Errors.sol";

/// @title ProvenanceRegistry
/// @notice The verifier anchors one dataset Merkle root per ended mission; the mission's buyer
///         finalizes (accepts) it. datasetId == missionId.
/// @dev Leaf = keccak256(bytes.concat(keccak256(abi.encode(submissionHash)))), compatible with
///      OpenZeppelin StandardMerkleTree.of(values, ["bytes32"]). Not audited.
contract ProvenanceRegistry is IProvenanceRegistry, AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    IMissionVault public immutable vault;
    mapping(uint256 => Dataset) internal datasets;

    constructor(address admin, IMissionVault vault_) {
        if (admin == address(0) || address(vault_) == address(0)) revert ZeroAddress();
        vault = vault_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Anchors the dataset of a Completed or Cancelled mission. One time only.
    function anchorDataset(uint256 missionId, bytes32 merkleRoot, uint256 sampleCount, bytes32 metadataHash)
        external
        onlyRole(VERIFIER_ROLE)
    {
        IMissionVault.Mission memory m = vault.getMission(missionId);
        if (m.status != IMissionVault.MissionStatus.Completed && m.status != IMissionVault.MissionStatus.Cancelled) {
            revert MissionNotEnded(missionId);
        }
        Dataset storage d = datasets[missionId];
        if (d.anchoredAt != 0) revert AlreadyAnchored(missionId);
        if (merkleRoot == bytes32(0)) revert InvalidRoot();
        if (sampleCount == 0 || sampleCount != m.acceptedCount) {
            revert SampleCountMismatch(m.acceptedCount, sampleCount);
        }

        d.merkleRoot = merkleRoot;
        d.metadataHash = metadataHash;
        d.sampleCount = sampleCount;
        // uint64 seconds overflow in ~584 billion years.
        // forge-lint: disable-next-line(unsafe-typecast)
        d.anchoredAt = uint64(block.timestamp);

        emit DatasetAnchored(missionId, merkleRoot, sampleCount, metadataHash);
    }

    /// @notice The mission's buyer accepts the anchored dataset. One time only.
    function finalizeDataset(uint256 missionId) external {
        if (msg.sender != vault.getMission(missionId).buyer) revert NotBuyer(missionId);
        Dataset storage d = datasets[missionId];
        if (d.anchoredAt == 0) revert NotAnchored(missionId);
        if (d.finalized) revert AlreadyFinalized(missionId);

        d.finalized = true;

        emit DatasetFinalized(missionId, msg.sender);
    }

    /// @notice True when `proof` links `submissionHash` to the anchored root AND the Vault paid it.
    function verifySample(uint256 missionId, bytes32 submissionHash, bytes32[] calldata proof)
        external
        view
        returns (bool)
    {
        Dataset storage d = datasets[missionId];
        if (d.anchoredAt == 0) return false;
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(submissionHash))));
        return MerkleProof.verifyCalldata(proof, d.merkleRoot, leaf) && vault.submissionPaid(submissionHash);
    }

    function getDataset(uint256 missionId) external view returns (Dataset memory) {
        return datasets[missionId];
    }
}
