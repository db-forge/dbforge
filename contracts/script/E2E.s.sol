// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MissionVault} from "../src/MissionVault.sol";
import {MissionFactory} from "../src/MissionFactory.sol";
import {ProvenanceRegistry} from "../src/ProvenanceRegistry.sol";
import {IMissionVault} from "../src/interfaces/IMissionVault.sol";
import {AlreadySettled, MissionNotActive} from "../src/Errors.sol";

/// @notice End-to-end demo flow against the DEPLOYED Monad testnet contracts (docs/E2E.md).
///         buyer createMission (2 x 0.01 MON) → verifier approve h1 → replay h1 (AlreadySettled) → approve h2
///         → Completed → withdrawFor(contributor) (+0.02 MON exactly) → 2-leaf OZ Merkle root → anchorDataset
///         → verifySample → buyer finalizeDataset(missionId, root).
///
///   export BUYER_ADDRESS=0x...  VERIFIER_ADDRESS=0x...  CONTRIBUTOR_ADDRESS=0x...   # CONTRIBUTOR optional
///   # fork (no keys, no broadcast):
///   forge script script/E2E.s.sol --fork-url https://testnet-rpc.monad.xyz
///   # real run (each role signs with its own keystore):
///   forge script script/E2E.s.sol --rpc-url https://testnet-rpc.monad.xyz \
///     --account dbforge-buyer --account dbforge-verifier --broadcast
contract E2E is Script {
    // Deployed addresses: deployments/monad-testnet.json
    MissionVault internal constant VAULT = MissionVault(0xcc10787653F33fefA68a455bEe3daB964C22e0b3);
    MissionFactory internal constant FACTORY = MissionFactory(0xC462FbC4ae4D522C19714c9DeE4D6f4Ff03c4c73);
    ProvenanceRegistry internal constant REGISTRY = ProvenanceRegistry(0x4e9D5E72c00e30be7A0431B6b69BF296362E99Ec);
    uint256 internal constant MONAD_TESTNET = 10143;

    uint256 internal constant REWARD = 0.01 ether;
    uint256 internal constant TARGET = 2;
    /// @dev Monad reverts a value spend that leaves an EOA below 10 MON (WALLETS.md). 1 MON covers the gas.
    uint256 internal constant BUYER_RESERVE = 10 ether;
    uint256 internal constant BUYER_GAS_MARGIN = 1 ether;

    error E2ECheckFailed(string step);

    function run() external {
        address buyer = vm.envAddress("BUYER_ADDRESS");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        // Fresh per run by default, so the balance delta and the withdrawable amount are exact.
        address contributor = vm.envOr(
            "CONTRIBUTOR_ADDRESS", makeAddr(string.concat("dbforge-e2e-contributor-", vm.toString(block.timestamp)))
        );
        bytes32 salt = keccak256(abi.encode(block.timestamp, contributor));
        bytes32 h1 = keccak256(abi.encode("dbforge-e2e-submission-1", salt));
        bytes32 h2 = keccak256(abi.encode("dbforge-e2e-submission-2", salt));

        _preflight(buyer, verifier, contributor);

        // 1. Buyer creates and funds the mission.
        vm.startBroadcast(buyer);
        uint256 missionId = FACTORY.createMission{value: REWARD * TARGET}(
            keccak256(abi.encode("dbforge-e2e-mission", salt)), REWARD, TARGET
        );
        vm.stopBroadcast();
        _requireStatus(missionId, IMissionVault.MissionStatus.Active, "1 createMission: Active");
        console2.log("[1] createMission ok, missionId", missionId);

        // 2. Verifier settles h1.
        vm.startBroadcast(verifier);
        VAULT.approveSubmission(missionId, contributor, h1);
        vm.stopBroadcast();
        console2.log("[2] approveSubmission h1 ok");

        // 3. Replay of h1 must revert AlreadySettled. Simulated with prank (never broadcast): it would only burn gas.
        _expectRevert(
            missionId, verifier, contributor, h1, abi.encodeWithSelector(AlreadySettled.selector, missionId, h1)
        );
        console2.log("[3] replay h1 -> AlreadySettled (as expected)");

        // 4. Verifier settles h2; the mission reaches its target.
        vm.startBroadcast(verifier);
        VAULT.approveSubmission(missionId, contributor, h2);
        vm.stopBroadcast();
        console2.log("[4] approveSubmission h2 ok");

        // 5. Completed. Any further settlement is refused with MissionNotActive (status is checked first).
        _requireStatus(missionId, IMissionVault.MissionStatus.Completed, "5 Completed");
        IMissionVault.Mission memory m = VAULT.getMission(missionId);
        if (m.acceptedCount != TARGET || m.remainingBudget != 0) revert E2ECheckFailed("5 counters");
        _expectRevert(
            missionId, verifier, contributor, h1, abi.encodeWithSelector(MissionNotActive.selector, missionId)
        );
        console2.log("[5] status Completed, acceptedCount 2, replay after completion -> MissionNotActive");

        // 6. Buyer pays the gas; the MON goes to the contributor.
        uint256 before = contributor.balance;
        vm.startBroadcast(buyer);
        VAULT.withdrawFor(contributor);
        vm.stopBroadcast();
        uint256 gained = contributor.balance - before;
        if (gained != REWARD * TARGET) revert E2ECheckFailed("6 contributor delta");
        (,, uint256 left) = VAULT.getContributorBalance(contributor);
        if (left != 0) revert E2ECheckFailed("6 withdrawable left");
        console2.log("[6] withdrawFor ok, contributor gained wei", gained);

        // 7. Dataset Merkle root, OpenZeppelin StandardMerkleTree format.
        bytes32 l1 = _leaf(h1);
        bytes32 l2 = _leaf(h2);
        bytes32 root = _hashPair(l1, l2);
        console2.log("[7] merkle root");
        console2.logBytes32(root);

        // 8. Verifier anchors the dataset.
        vm.startBroadcast(verifier);
        REGISTRY.anchorDataset(missionId, root, TARGET, keccak256(abi.encode("dbforge-e2e-dataset", salt)));
        vm.stopBroadcast();
        console2.log("[8] anchorDataset ok");

        // 9. Every sample verifies with its sibling as proof; an unknown hash does not.
        if (!REGISTRY.verifySample(missionId, h1, _proof(l2))) revert E2ECheckFailed("9 verify h1");
        if (!REGISTRY.verifySample(missionId, h2, _proof(l1))) revert E2ECheckFailed("9 verify h2");
        if (REGISTRY.verifySample(missionId, keccak256("not-a-sample"), _proof(l2))) {
            revert E2ECheckFailed("9 unknown hash verified");
        }
        console2.log("[9] verifySample h1 true, h2 true, unknown false");

        // 10. Buyer accepts the root it reviewed.
        vm.startBroadcast(buyer);
        REGISTRY.finalizeDataset(missionId, root);
        vm.stopBroadcast();
        if (!REGISTRY.getDataset(missionId).finalized) revert E2ECheckFailed("10 finalized");
        console2.log("[10] finalizeDataset ok");

        if (buyer.balance < BUYER_RESERVE) revert E2ECheckFailed("buyer below reserve");
        console2.log("buyer balance after (wei)", buyer.balance);
        console2.log("E2E PASS  missionId", missionId, "contributor", contributor);
    }

    function _preflight(address buyer, address verifier, address contributor) internal view {
        if (block.chainid != MONAD_TESTNET) revert E2ECheckFailed("chainId is not Monad testnet");
        if (buyer == verifier || contributor == buyer || contributor == verifier) {
            revert E2ECheckFailed("roles must be distinct addresses");
        }
        if (!VAULT.hasRole(VAULT.VERIFIER_ROLE(), verifier)) revert E2ECheckFailed("vault verifier role");
        if (!REGISTRY.hasRole(REGISTRY.VERIFIER_ROLE(), verifier)) revert E2ECheckFailed("registry verifier role");
        if (VAULT.paused() || REGISTRY.paused()) revert E2ECheckFailed("paused");
        if (buyer.balance < BUYER_RESERVE + REWARD * TARGET + BUYER_GAS_MARGIN) {
            revert E2ECheckFailed("buyer would drop below the 10 MON reserve");
        }
        if (contributor.code.length != 0) revert E2ECheckFailed("contributor must be an EOA");
        (,, uint256 pending) = VAULT.getContributorBalance(contributor);
        if (pending != 0) revert E2ECheckFailed("contributor must start with nothing withdrawable");

        console2.log("chainId    ", block.chainid);
        console2.log("buyer      ", buyer, buyer.balance);
        console2.log("verifier   ", verifier, verifier.balance);
        console2.log("contributor", contributor, contributor.balance);
    }

    function _requireStatus(uint256 missionId, IMissionVault.MissionStatus want, string memory step) internal view {
        if (VAULT.getMission(missionId).status != want) revert E2ECheckFailed(step);
    }

    function _expectRevert(uint256 missionId, address verifier, address contributor, bytes32 h, bytes memory want)
        internal
    {
        vm.prank(verifier);
        try VAULT.approveSubmission(missionId, contributor, h) {
            revert E2ECheckFailed("replay did not revert");
        } catch (bytes memory got) {
            if (keccak256(got) != keccak256(want)) revert E2ECheckFailed("replay reverted with the wrong error");
        }
    }

    /// @dev Same leaf as ProvenanceRegistry.verifySample and StandardMerkleTree.of(values, ["bytes32"]).
    function _leaf(bytes32 h) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(h))));
    }

    /// @dev OpenZeppelin commutative hash: the smaller node first.
    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    function _proof(bytes32 sibling) internal pure returns (bytes32[] memory p) {
        p = new bytes32[](1);
        p[0] = sibling;
    }
}
