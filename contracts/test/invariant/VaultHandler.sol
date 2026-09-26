// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {MissionVault} from "../../src/MissionVault.sol";
import {MissionFactory} from "../../src/MissionFactory.sol";
import {IMissionVault} from "../../src/interfaces/IMissionVault.sol";
import {RejectingReceiver, ForceSender} from "../utils/Mocks.sol";

/// @dev Drives random create / settle / withdraw / withdrawFor / cancel / pause / force-send sequences
///      and keeps ghost accounting. One contributor is a contract that rejects MON (its withdrawals fail).
contract VaultHandler is CommonBase, StdCheats, StdUtils {
    MissionVault public immutable vault;
    MissionFactory public immutable factory;
    address public immutable verifier;
    address public immutable admin;

    address[] internal buyers;
    address[] public contributors;

    uint256 public ghostFunded;
    uint256 public ghostRefunded;
    uint256 public ghostForced;
    uint256 public ghostWithdrawn;
    /// Successful settlements per (missionId, hash).
    mapping(uint256 => mapping(bytes32 => uint256)) public ghostSettleCount;
    uint256[] internal settledMission;
    bytes32[] internal settledHash;
    /// Settlements that went through on a mission that was not Active before the call.
    uint256 public ghostSettledAfterEnd;
    /// Settlements that went through while paused.
    uint256 public ghostSettledWhilePaused;

    /// Call outcome counters, to show the run is not vacuous.
    uint256 public okSettles;
    uint256 public rejectedDuplicates;
    uint256 public crossMissionReuses;
    uint256 public okCancels;
    uint256 public okWithdrawals;
    uint256 public failedWithdrawals;
    uint256 public pausedRejects;

    constructor(MissionVault vault_, MissionFactory factory_, address verifier_, address admin_) {
        vault = vault_;
        factory = factory_;
        verifier = verifier_;
        admin = admin_;
        for (uint256 i; i < 3; ++i) {
            buyers.push(makeAddr(string.concat("buyer", vm.toString(i))));
            contributors.push(makeAddr(string.concat("contributor", vm.toString(i))));
        }
        contributors.push(address(new RejectingReceiver()));
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
        // Mostly aim at an Active mission so settlements happen; 1 in 5 calls keeps the pick (may be ended).
        if (hashSeed % 5 != 0) missionId = _nextActive(missionId, last);
        address contributor = contributors[contributorSeed % contributors.length];
        // Reuse an old hash about a quarter of the time: same mission -> must fail, other mission -> may settle.
        bool reuse = settledHash.length > 0 && hashSeed % 4 == 0;
        bytes32 h = reuse ? settledHash[hashSeed % settledHash.length] : keccak256(abi.encode("h", hashSeed));

        IMissionVault.Mission memory before = vault.getMission(missionId);
        bool wasPaused = vault.paused();
        vm.prank(verifier);
        try vault.approveSubmission(missionId, contributor, h) {
            if (before.status != IMissionVault.MissionStatus.Active) ghostSettledAfterEnd++;
            if (wasPaused) ghostSettledWhilePaused++;
            if (reuse) crossMissionReuses++;
            ghostSettleCount[missionId][h]++;
            settledMission.push(missionId);
            settledHash.push(h);
            okSettles++;
        } catch {
            if (wasPaused) pausedRejects++;
            else if (ghostSettleCount[missionId][h] != 0) rejectedDuplicates++;
        }
    }

    function _nextActive(uint256 start, uint256 last) internal view returns (uint256) {
        for (uint256 i; i < last; ++i) {
            uint256 id = (start - 1 + i) % last + 1;
            if (vault.getMission(id).status == IMissionVault.MissionStatus.Active) return id;
        }
        return start;
    }

    function withdraw(uint256 contributorSeed, bool viaHelper) external {
        address contributor = contributors[contributorSeed % contributors.length];
        (,, uint256 available) = vault.getContributorBalance(contributor);
        bool ok;
        if (viaHelper) {
            vm.prank(address(0xCAFE));
            try vault.withdrawFor(contributor) {
                ok = true;
            } catch {}
        } else {
            vm.prank(contributor);
            try vault.withdraw() {
                ok = true;
            } catch {}
        }
        if (ok) {
            ghostWithdrawn += available;
            okWithdrawals++;
        } else {
            failedWithdrawals++;
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

    function togglePause(uint256 seed) external {
        // Rare: pause on 1 of 16 calls; the next call unpauses.
        if (vault.paused()) {
            vm.prank(admin);
            vault.unpause();
        } else if (seed % 16 == 0) {
            vm.prank(admin);
            vault.pause();
        }
    }

    function forceSend(uint256 amount) external {
        amount = _bound(amount, 1, 1 ether);
        vm.deal(address(this), amount);
        new ForceSender{value: amount}(payable(address(vault)));
        ghostForced += amount;
    }

    function contributorCount() external view returns (uint256) {
        return contributors.length;
    }

    function settledCount() external view returns (uint256) {
        return settledHash.length;
    }

    function settledAt(uint256 i) external view returns (uint256, bytes32) {
        return (settledMission[i], settledHash[i]);
    }
}
