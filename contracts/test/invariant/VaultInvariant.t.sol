// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MissionVault} from "../../src/MissionVault.sol";
import {MissionFactory} from "../../src/MissionFactory.sol";
import {IMissionVault} from "../../src/interfaces/IMissionVault.sol";
import {VaultHandler} from "./VaultHandler.sol";

/// @notice ARCHITECTURE.md §3 invariants 1-4.
contract VaultInvariantTest is Test {
    MissionVault internal vault;
    MissionFactory internal factory;
    VaultHandler internal handler;

    function setUp() public {
        address admin = makeAddr("admin");
        address verifier = makeAddr("verifier");
        vault = new MissionVault(admin);
        factory = new MissionFactory(IMissionVault(address(vault)));
        vm.startPrank(admin);
        vault.setFactory(address(factory));
        vault.grantRole(vault.VERIFIER_ROLE(), verifier);
        vm.stopPrank();

        handler = new VaultHandler(vault, factory, verifier);
        targetContract(address(handler));
    }

    function afterInvariant() public {
        emit log_named_uint("missions", vault.nextMissionId() - 1);
        emit log_named_uint("ok approvals", handler.okApprovals());
        emit log_named_uint("rejected duplicates", handler.rejectedDuplicates());
        emit log_named_uint("ok cancels", handler.okCancels());
    }

    /// 1. address(vault).balance == sum of remainingBudget over all missions.
    function invariant_balanceEqualsTotalRemainingBudget() public view {
        uint256 sum;
        uint256 last = vault.nextMissionId();
        for (uint256 id = 1; id < last; ++id) {
            sum += vault.getMission(id).remainingBudget;
        }
        assertEq(address(vault).balance, sum);
    }

    /// Conservation: everything funded is either still in the vault, paid out or refunded.
    function invariant_fundsConserved() public view {
        assertEq(handler.ghostFunded(), address(vault).balance + handler.ghostPaidOut() + handler.ghostRefunded());
    }

    /// 2. acceptedCount <= targetCount, and the budget matches the unfilled slots.
    function invariant_acceptedWithinTargetAndBudgetConsistent() public view {
        uint256 last = vault.nextMissionId();
        for (uint256 id = 1; id < last; ++id) {
            IMissionVault.Mission memory m = vault.getMission(id);
            assertLe(m.acceptedCount, m.targetCount);
            if (m.status == IMissionVault.MissionStatus.Active) {
                assertLt(m.acceptedCount, m.targetCount);
                assertEq(m.remainingBudget, m.rewardPerSubmission * (m.targetCount - m.acceptedCount));
            } else {
                assertEq(m.remainingBudget, 0);
            }
            if (m.status == IMissionVault.MissionStatus.Completed) {
                assertEq(m.acceptedCount, m.targetCount);
            }
        }
    }

    /// 3. A submission hash is paid at most once, and every paid hash is marked.
    function invariant_submissionPaidAtMostOnce() public view {
        uint256 n = handler.usedHashCount();
        for (uint256 i; i < n; ++i) {
            bytes32 h = handler.usedHash(i);
            assertEq(handler.ghostPayCount(h), 1);
            assertTrue(vault.submissionPaid(h));
        }
    }

    /// 4. Completed or Cancelled missions never pay again.
    function invariant_endedMissionsNeverPay() public view {
        assertEq(handler.ghostPaidAfterEnd(), 0);
    }
}
