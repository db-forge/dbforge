// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Hashes} from "@openzeppelin/contracts/utils/cryptography/Hashes.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {BaseTest} from "./utils/BaseTest.sol";
import {ProvenanceRegistry} from "../src/ProvenanceRegistry.sol";
import {IMissionVault} from "../src/interfaces/IMissionVault.sol";
import {IProvenanceRegistry} from "../src/interfaces/IProvenanceRegistry.sol";
import {
    ZeroAddress,
    MissionNotEnded,
    NotBuyer,
    NotAnchored,
    AlreadyFinalized,
    SampleCountMismatch,
    InvalidRoot
} from "../src/Errors.sol";

contract ProvenanceRegistryTest is BaseTest {
    bytes32 internal constant MANIFEST = keccak256("dataset-manifest");

    uint256 internal missionId;
    bytes32 internal l0;
    bytes32 internal l1;
    bytes32 internal l2;
    bytes32 internal n01;
    bytes32 internal root;

    function setUp() public override {
        super.setUp();
        missionId = _createDefault();
        _complete(missionId, TARGET, 0); // settles _sub(0), _sub(1), _sub(2)

        // Tree over the three settled submissions: root = H(H(l0, l1), l2).
        l0 = _leaf(_sub(0));
        l1 = _leaf(_sub(1));
        l2 = _leaf(_sub(2));
        n01 = Hashes.commutativeKeccak256(l0, l1);
        root = Hashes.commutativeKeccak256(n01, l2);
    }

    /// @dev StandardMerkleTree.of(values, ["bytes32"]) leaf format (ARCHITECTURE.md §5).
    function _leaf(bytes32 submissionHash) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(submissionHash))));
    }

    function _anchor() internal {
        vm.prank(verifier);
        registry.anchorDataset(missionId, root, TARGET, MANIFEST);
    }

    function _proof(bytes32 a) internal pure returns (bytes32[] memory p) {
        p = new bytes32[](1);
        p[0] = a;
    }

    function _proof(bytes32 a, bytes32 b) internal pure returns (bytes32[] memory p) {
        p = new bytes32[](2);
        p[0] = a;
        p[1] = b;
    }

    // --- constructor ---

    function test_constructor_setsVaultAndAdmin() public view {
        assertEq(address(registry.vault()), address(vault));
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(registry.hasRole(registry.VERIFIER_ROLE(), verifier));
        assertTrue(registry.hasRole(registry.PAUSER_ROLE(), admin));
        assertEq(registry.PAUSER_ROLE(), keccak256("PAUSER_ROLE"));
        assertFalse(registry.paused());
    }

    function test_constructor_revertsOnZeroAdmin() public {
        vm.expectRevert(ZeroAddress.selector);
        new ProvenanceRegistry(address(0), IMissionVault(address(vault)));
    }

    function test_constructor_revertsOnZeroVault() public {
        vm.expectRevert(ZeroAddress.selector);
        new ProvenanceRegistry(admin, IMissionVault(address(0)));
    }

    // --- anchorDataset ---

    function test_anchor_storesAndEmits() public {
        vm.warp(1_800_000_000);
        vm.expectEmit(address(registry));
        emit IProvenanceRegistry.DatasetAnchored(missionId, root, bytes32(0), TARGET, MANIFEST);
        _anchor();

        IProvenanceRegistry.Dataset memory d = registry.getDataset(missionId);
        assertEq(d.merkleRoot, root);
        assertEq(d.metadataHash, MANIFEST);
        assertEq(d.sampleCount, TARGET);
        assertEq(d.anchoredAt, 1_800_000_000);
        assertFalse(d.finalized);
    }

    function test_anchor_onlyVerifier() public {
        bytes32 role = registry.VERIFIER_ROLE();
        address[3] memory callers = [stranger, buyer, admin];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(
                abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, callers[i], role)
            );
            registry.anchorDataset(missionId, root, TARGET, MANIFEST);
        }
    }

    function test_anchor_vaultVerifierRoleIsNotEnough() public {
        // Roles are per contract: a Vault verifier without the Registry role cannot anchor.
        address vaultOnly = makeAddr("vaultOnly");
        bytes32 vaultRole = vault.VERIFIER_ROLE();
        vm.prank(admin);
        vault.grantRole(vaultRole, vaultOnly);
        bytes32 role = registry.VERIFIER_ROLE();
        vm.prank(vaultOnly);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, vaultOnly, role)
        );
        registry.anchorDataset(missionId, root, TARGET, MANIFEST);
    }

    function test_anchor_revertsWhileActive() public {
        uint256 active = _createDefault();
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(MissionNotEnded.selector, active));
        registry.anchorDataset(active, root, TARGET, MANIFEST);
    }

    function test_anchor_revertsOnUnknownMission() public {
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(MissionNotEnded.selector, 999));
        registry.anchorDataset(999, root, 1, MANIFEST);
    }

    function test_anchor_worksForCancelledMission() public {
        uint256 id = _createDefault();
        _approve(id, contributor, _sub(10));
        vm.prank(buyer);
        vault.cancelMission(id);

        bytes32 single = _leaf(_sub(10));
        vm.prank(verifier);
        registry.anchorDataset(id, single, 1, MANIFEST);
        assertEq(registry.getDataset(id).sampleCount, 1);
        assertTrue(registry.verifySample(id, _sub(10), new bytes32[](0)));
    }

    function test_anchor_revertsForCancelledMissionWithNoSamples() public {
        uint256 id = _createDefault();
        vm.prank(buyer);
        vault.cancelMission(id);
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(SampleCountMismatch.selector, 0, 0));
        registry.anchorDataset(id, root, 0, MANIFEST);
    }

    function test_anchor_revertsOnZeroRoot() public {
        vm.prank(verifier);
        vm.expectRevert(InvalidRoot.selector);
        registry.anchorDataset(missionId, bytes32(0), TARGET, MANIFEST);
    }

    function test_anchor_revertsOnZeroSampleCount() public {
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(SampleCountMismatch.selector, TARGET, 0));
        registry.anchorDataset(missionId, root, 0, MANIFEST);
    }

    function test_anchor_revertsOnSampleCountMismatch() public {
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(SampleCountMismatch.selector, TARGET, TARGET + 1));
        registry.anchorDataset(missionId, root, TARGET + 1, MANIFEST);
    }

    function test_reanchor_beforeFinalize_overwritesAndEmitsPreviousRoot() public {
        // F5: a wrong root can be corrected until the buyer finalizes.
        bytes32 wrongRoot = keccak256("wrong root");
        vm.warp(1_800_000_000);
        vm.prank(verifier);
        registry.anchorDataset(missionId, wrongRoot, TARGET, keccak256("old manifest"));
        assertFalse(registry.verifySample(missionId, _sub(2), _proof(n01)));

        vm.warp(1_800_000_100);
        vm.expectEmit(address(registry));
        emit IProvenanceRegistry.DatasetAnchored(missionId, root, wrongRoot, TARGET, MANIFEST);
        _anchor();

        IProvenanceRegistry.Dataset memory d = registry.getDataset(missionId);
        assertEq(d.merkleRoot, root);
        assertEq(d.metadataHash, MANIFEST);
        assertEq(d.anchoredAt, 1_800_000_100, "timestamp of the latest anchor");
        assertFalse(d.finalized);
        assertTrue(registry.verifySample(missionId, _sub(2), _proof(n01)));
    }

    function test_reanchor_afterFinalize_reverts() public {
        _anchor();
        vm.prank(buyer);
        registry.finalizeDataset(missionId);
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(AlreadyFinalized.selector, missionId));
        registry.anchorDataset(missionId, keccak256("other root"), TARGET, MANIFEST);
        assertEq(registry.getDataset(missionId).merkleRoot, root, "root is frozen");
    }

    function test_reanchor_stillChecksInputs() public {
        _anchor();
        vm.startPrank(verifier);
        vm.expectRevert(InvalidRoot.selector);
        registry.anchorDataset(missionId, bytes32(0), TARGET, MANIFEST);
        vm.expectRevert(abi.encodeWithSelector(SampleCountMismatch.selector, TARGET, TARGET - 1));
        registry.anchorDataset(missionId, root, TARGET - 1, MANIFEST);
        vm.stopPrank();
    }

    // --- pause ---

    function test_pause_blocksAnchor() public {
        vm.prank(guardian);
        registry.pause();
        vm.prank(verifier);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        registry.anchorDataset(missionId, root, TARGET, MANIFEST);

        vm.prank(admin);
        registry.unpause();
        _anchor();
        assertEq(registry.getDataset(missionId).merkleRoot, root);
    }

    function test_pause_allowsFinalizeAndVerify() public {
        _anchor();
        vm.prank(guardian);
        registry.pause();
        assertTrue(registry.verifySample(missionId, _sub(2), _proof(n01)));
        vm.prank(buyer);
        registry.finalizeDataset(missionId);
        assertTrue(registry.getDataset(missionId).finalized);
    }

    function test_pause_onlyPauser_unpause_onlyAdmin() public {
        bytes32 pauser = registry.PAUSER_ROLE();
        vm.prank(verifier);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, verifier, pauser)
        );
        registry.pause();

        vm.expectEmit(address(registry));
        emit Pausable.Paused(guardian);
        vm.prank(guardian);
        registry.pause();

        bytes32 adminRole = registry.DEFAULT_ADMIN_ROLE();
        vm.prank(guardian);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, guardian, adminRole)
        );
        registry.unpause();

        vm.prank(admin);
        registry.unpause();
        assertFalse(registry.paused());
    }

    function test_revokedVerifier_cannotAnchor() public {
        bytes32 role = registry.VERIFIER_ROLE();
        vm.prank(admin);
        registry.revokeRole(role, verifier);
        vm.prank(verifier);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, verifier, role)
        );
        registry.anchorDataset(missionId, root, TARGET, MANIFEST);
    }

    // --- finalizeDataset ---

    function test_finalize_byBuyer() public {
        _anchor();
        vm.expectEmit(address(registry));
        emit IProvenanceRegistry.DatasetFinalized(missionId, buyer);
        vm.prank(buyer);
        registry.finalizeDataset(missionId);
        assertTrue(registry.getDataset(missionId).finalized);
    }

    function test_finalize_onlyBuyer() public {
        _anchor();
        address[3] memory callers = [stranger, verifier, admin];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(abi.encodeWithSelector(NotBuyer.selector, missionId));
            registry.finalizeDataset(missionId);
        }
    }

    function test_finalize_revertsWhenNotAnchored() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(NotAnchored.selector, missionId));
        registry.finalizeDataset(missionId);
    }

    function test_finalize_revertsTwice() public {
        _anchor();
        vm.startPrank(buyer);
        registry.finalizeDataset(missionId);
        vm.expectRevert(abi.encodeWithSelector(AlreadyFinalized.selector, missionId));
        registry.finalizeDataset(missionId);
        vm.stopPrank();
    }

    // --- verifySample ---

    function test_verifySample_validProofs() public {
        _anchor();
        assertTrue(registry.verifySample(missionId, _sub(0), _proof(l1, l2)));
        assertTrue(registry.verifySample(missionId, _sub(1), _proof(l0, l2)));
        assertTrue(registry.verifySample(missionId, _sub(2), _proof(n01)));
    }

    /// @dev Vector generated off-chain with @openzeppelin/merkle-tree@1:
    ///      StandardMerkleTree.of([[_sub(0)], [_sub(1)], [_sub(2)]], ["bytes32"])
    ///      Guards the leaf format that lib/monad/merkle.ts relies on.
    function test_verifySample_matchesOpenZeppelinJsTree() public {
        bytes32 jsRoot = 0x606f8985f6718b7365f76ab2947d41e18c42b9c2a2a348c885065287742287be;
        assertEq(_sub(0), 0xddda1b89871d04f6108c423d2d1e2110fd5540d3d2ffd4bd3c6bd0cbd711c23d);
        vm.prank(verifier);
        registry.anchorDataset(missionId, jsRoot, TARGET, MANIFEST);

        assertTrue(
            registry.verifySample(
                missionId,
                _sub(0),
                _proof(
                    0x503eb4eff1808bfaca868ff3cdcf3f2f72c9991167877e6d43c5e761ceaaa7ea,
                    0xf45620d0e30dd17c6033f2a7f7c283a649f11c3c3af09cd7a40bb3222e67f9b9
                )
            )
        );
        assertTrue(
            registry.verifySample(
                missionId,
                _sub(1),
                _proof(
                    0x4e46af3914d9eee76303e056fa372209c46e82b7008549fa8277347d08bb153e,
                    0xf45620d0e30dd17c6033f2a7f7c283a649f11c3c3af09cd7a40bb3222e67f9b9
                )
            )
        );
        assertTrue(
            registry.verifySample(
                missionId, _sub(2), _proof(0xa64f341e3839f625b3243e05078eb584fb93b7a325a96c659f93158b09fcae08)
            )
        );
    }

    function test_verifySample_wrongProofIsFalse() public {
        _anchor();
        assertFalse(registry.verifySample(missionId, _sub(0), _proof(l2, l1)));
        assertFalse(registry.verifySample(missionId, _sub(2), _proof(l0)));
        assertFalse(registry.verifySample(missionId, _sub(0), new bytes32[](0)));
    }

    function test_verifySample_rawHashAsLeafIsFalse() public {
        // A proof built over unhashed values must not verify (double-hash leaf format).
        bytes32 rawRoot = Hashes.commutativeKeccak256(_sub(0), _sub(1));
        uint256 id = _createDefault();
        _complete(id, TARGET - 1, 20);
        _approve(id, contributor, _sub(22));
        vm.prank(verifier);
        registry.anchorDataset(id, rawRoot, TARGET, MANIFEST);
        assertFalse(registry.verifySample(id, _sub(0), _proof(_sub(1))));
    }

    function test_verifySample_falseWhenNotAnchored() public view {
        assertFalse(registry.verifySample(missionId, _sub(0), _proof(l1, l2)));
    }

    function test_verifySample_falseWhenSubmissionNotSettled() public {
        // Valid proof for a hash that was never settled by the Vault.
        bytes32 unpaid = keccak256("never settled");
        uint256 id = _createDefault();
        _approve(id, contributor, _sub(30));
        vm.prank(buyer);
        vault.cancelMission(id);

        bytes32 lUnpaid = _leaf(unpaid);
        bytes32 lPaid = _leaf(_sub(30));
        bytes32 r = Hashes.commutativeKeccak256(lUnpaid, lPaid);
        vm.prank(verifier);
        registry.anchorDataset(id, r, 1, MANIFEST);

        assertTrue(registry.verifySample(id, _sub(30), _proof(lUnpaid)));
        assertFalse(registry.verifySample(id, unpaid, _proof(lPaid)));
    }

    function test_verifySample_falseForHashSettledOnlyInOtherMission() public {
        // F3: true means "included and settled in THIS mission". _sub(0) is settled in `missionId` only.
        uint256 other = _createDefault();
        _approve(other, contributor, _sub(40));
        vm.prank(buyer);
        vault.cancelMission(other);

        bytes32 lForeign = _leaf(_sub(0));
        bytes32 lOwn = _leaf(_sub(40));
        vm.prank(verifier);
        registry.anchorDataset(other, Hashes.commutativeKeccak256(lForeign, lOwn), 1, MANIFEST);

        assertTrue(registry.verifySample(other, _sub(40), _proof(lForeign)));
        assertFalse(registry.verifySample(other, _sub(0), _proof(lOwn)));
    }

    function test_verifySample_sameHashSettledInTwoMissions_trueInBoth() public {
        uint256 other = _createDefault();
        _approve(other, stranger, _sub(0)); // same file, second mission
        vm.prank(buyer);
        vault.cancelMission(other);
        _anchor();
        vm.prank(verifier);
        registry.anchorDataset(other, _leaf(_sub(0)), 1, MANIFEST);

        assertTrue(registry.verifySample(missionId, _sub(0), _proof(l1, l2)));
        assertTrue(registry.verifySample(other, _sub(0), new bytes32[](0)));
    }

    function test_verifySample_rejectsInternalNodeAsLeaf() public {
        // n01 is an internal node; presenting it as a "submission" must fail (double-hash leaves).
        _anchor();
        assertFalse(registry.verifySample(missionId, n01, _proof(l2)));
    }

    function test_getDataset_unknownIsEmpty() public view {
        IProvenanceRegistry.Dataset memory d = registry.getDataset(4242);
        assertEq(d.merkleRoot, bytes32(0));
        assertEq(d.anchoredAt, 0);
        assertFalse(d.finalized);
    }
}
