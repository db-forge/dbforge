// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MissionVault} from "../../src/MissionVault.sol";
import {MissionFactory} from "../../src/MissionFactory.sol";
import {IMissionVault} from "../../src/interfaces/IMissionVault.sol";
import {VaultHandler} from "./VaultHandler.sol";

/// @notice ARCHITECTURE.md §3 invariants 1-6 (v2: pull payments, (missionId, hash) replay key).
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

        handler = new VaultHandler(vault, factory, verifier, admin);
        targetContract(address(handler));
        // Only the actions; the handler's public view getters would dilute the call sequence.
        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = VaultHandler.createMission.selector;
        selectors[1] = VaultHandler.approve.selector;
        selectors[2] = VaultHandler.withdraw.selector;
        selectors[3] = VaultHandler.cancel.selector;
        selectors[4] = VaultHandler.togglePause.selector;
        selectors[5] = VaultHandler.forceSend.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function afterInvariant() public {
        emit log_named_uint("missions", vault.nextMissionId() - 1);
        emit log_named_uint("ok settles", handler.okSettles());
        emit log_named_uint("rejected duplicates (same mission)", handler.rejectedDuplicates());
        emit log_named_uint("hash reused in another mission", handler.crossMissionReuses());
        emit log_named_uint("ok withdrawals", handler.okWithdrawals());
        emit log_named_uint("failed withdrawals", handler.failedWithdrawals());
        emit log_named_uint("ok cancels", handler.okCancels());
        emit log_named_uint("rejected while paused", handler.pausedRejects());
        emit log_named_uint("forced wei", handler.ghostForced());
    }

    function _sumRemaining() internal view returns (uint256 sum) {
        uint256 last = vault.nextMissionId();
        for (uint256 id = 1; id < last; ++id) {
            sum += vault.getMission(id).remainingBudget;
        }
    }

    function _sumBalances() internal view returns (uint256 credited, uint256 withdrawn, uint256 withdrawable) {
        uint256 n = handler.contributorCount();
        for (uint256 i; i < n; ++i) {
            (uint256 c, uint256 w, uint256 a) = vault.getContributorBalance(handler.contributors(i));
            credited += c;
            withdrawn += w;
            withdrawable += a;
        }
    }

    /// 1. balance >= Σ remainingBudget + Σ withdrawable; the surplus is exactly the forced MON.
    function invariant_balanceCoversObligations() public view {
        (,, uint256 withdrawable) = _sumBalances();
        uint256 owed = _sumRemaining() + withdrawable;
        assertGe(address(vault).balance, owed);
        assertEq(address(vault).balance, owed + handler.ghostForced());
    }

    /// 2. Conservation: funded == Σ remaining + Σ credited + refunded, and Σ credited == Σ withdrawn + Σ withdrawable.
    function invariant_conservation() public view {
        (uint256 credited, uint256 withdrawn, uint256 withdrawable) = _sumBalances();
        assertEq(handler.ghostFunded(), _sumRemaining() + credited + handler.ghostRefunded());
        assertEq(credited, withdrawn + withdrawable);
        assertEq(withdrawn, handler.ghostWithdrawn());
    }

    /// 3. acceptedCount <= targetCount; remainingBudget == reward × (target − accepted) while Active, 0 otherwise.
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

    /// 4. A (missionId, hash) pair is settled at most once, and every settled pair is recorded.
    function invariant_pairSettledAtMostOnce() public view {
        uint256 n = handler.settledCount();
        for (uint256 i; i < n; ++i) {
            (uint256 id, bytes32 h) = handler.settledAt(i);
            assertEq(handler.ghostSettleCount(id, h), 1);
            (bool settled, address who, uint256 amount) = vault.getSettlement(id, h);
            assertTrue(settled);
            assertTrue(who != address(0));
            assertEq(amount, vault.getMission(id).rewardPerSubmission);
        }
    }

    /// 5. An ended mission never settles again (and nothing settles while paused).
    function invariant_endedMissionsNeverSettle() public view {
        assertEq(handler.ghostSettledAfterEnd(), 0);
        assertEq(handler.ghostSettledWhilePaused(), 0);
    }

    /// 6. withdrawn[c] <= credited[c] for every contributor.
    function invariant_withdrawnNeverExceedsCredited() public view {
        uint256 n = handler.contributorCount();
        for (uint256 i; i < n; ++i) {
            address c = handler.contributors(i);
            assertLe(vault.withdrawn(c), vault.credited(c));
        }
    }
}
