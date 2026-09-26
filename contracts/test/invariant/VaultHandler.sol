// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {MissionVault} from "../../src/MissionVault.sol";
import {MissionFactory} from "../../src/MissionFactory.sol";
import {IMissionVault} from "../../src/interfaces/IMissionVault.sol";

/// @dev Drives random create / approve / cancel sequences and keeps ghost accounting.
contract VaultHandler is CommonBase, StdCheats, StdUtils {
    MissionVault public immutable vault;
    MissionFactory public immutable factory;
    address public immutable verifier;

    address[] internal buyers;
    address[] internal contributors;

    uint256 public ghostFunded;
    uint256 public ghostPaidOut;
    uint256 public ghostRefunded;
    /// Successful payouts per submission hash.
    mapping(bytes32 => uint256) public ghostPayCount;
    bytes32[] internal usedHashes;
    /// Counts approvals that went through on a mission that was not Active before the call.
    uint256 public ghostPaidAfterEnd;
    /// Call outcome counters, to show the run is not vacuous.
    uint256 public okApprovals;
    uint256 public rejectedDuplicates;
    uint256 public okCancels;

    constructor(MissionVault vault_, MissionFactory factory_, address verifier_) {
        vault = vault_;
        factory = factory_;
        verifier = verifier_;
        for (uint256 i; i < 3; ++i) {
            buyers.push(makeAddr(string.concat("buyer", vm.toString(i))));
            contributors.push(makeAddr(string.concat("contributor", vm.toString(i))));
        }
    }

    function createMission(uint256 buyerSeed, uint256 reward, uint256 target) external {
        address buyer = buyers[buyerSeed % buyers.length];
        reward = _bound(reward, 1, 1 ether);
        target = _bound(target, 1, 20);
        uint256 total = reward * target;
        vm.deal(buyer, buyer.balance + total);
        vm.prank(buyer);
        factory.createMission{value: total}(keccak256(abi.encode(buyer, reward, target)), reward, target);
        ghostFunded += total;
    }

    function approve(uint256 missionSeed, uint256 contributorSeed, uint256 hashSeed) external {
        uint256 last = vault.nextMissionId() - 1;
        if (last == 0) return;
        uint256 missionId = _bound(missionSeed, 1, last);
        address contributor = contributors[contributorSeed % contributors.length];
        // Reuse an old hash about a quarter of the time to exercise the duplicate guard.
        bytes32 h = (usedHashes.length > 0 && hashSeed % 4 == 0)
            ? usedHashes[hashSeed % usedHashes.length]
            : keccak256(abi.encode("h", hashSeed));

        IMissionVault.Mission memory before = vault.getMission(missionId);
        vm.prank(verifier);
        try vault.approveSubmission(missionId, contributor, h) {
            if (before.status != IMissionVault.MissionStatus.Active) ghostPaidAfterEnd++;
            ghostPaidOut += before.rewardPerSubmission;
            ghostPayCount[h]++;
            usedHashes.push(h);
            okApprovals++;
        } catch {
            if (vault.submissionPaid(h)) rejectedDuplicates++;
        }
    }

    function cancel(uint256 missionSeed, bool asStranger) external {
        uint256 last = vault.nextMissionId() - 1;
        // Cancel only on 1 of 4 calls so missions live long enough to reach their target.
        if (last == 0 || missionSeed % 4 != 0) return;
        uint256 missionId = _bound(missionSeed / 4, 1, last);
        IMissionVault.Mission memory before = vault.getMission(missionId);
        address caller = asStranger ? address(0xBEEF) : before.buyer;
        vm.prank(caller);
        try vault.cancelMission(missionId) {
            ghostRefunded += before.remainingBudget;
            okCancels++;
        } catch {}
    }

    function usedHashCount() external view returns (uint256) {
        return usedHashes.length;
    }

    function usedHash(uint256 i) external view returns (bytes32) {
        return usedHashes[i];
    }
}
