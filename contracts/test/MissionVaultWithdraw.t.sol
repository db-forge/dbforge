// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BaseTest} from "./utils/BaseTest.sol";
import {
    RejectingReceiver,
    ReentrantReceiver,
    ReturnBombReceiver,
    GasHungryReceiver,
    FactoryReentrantReceiver
} from "./utils/Mocks.sol";
import {IMissionVault} from "../src/interfaces/IMissionVault.sol";
import {IMissionFactory} from "../src/interfaces/IMissionFactory.sol";
import {NothingToWithdraw, TransferFailed} from "../src/Errors.sol";

/// @notice Pull payments (withdraw / withdrawFor) and the pause brake on the Vault.
contract MissionVaultWithdrawTest is BaseTest {
    // --- withdraw ---

    function test_withdraw_paysWithdrawableAndEmits() public {
        uint256 id = _createDefault();
        _complete(id, 2, 0);

        vm.expectEmit(address(vault));
        emit IMissionVault.Withdrawn(contributor, 2 * REWARD);
        _withdraw(contributor);

        assertEq(contributor.balance, 2 * REWARD);
        assertEq(address(vault).balance, REWARD * (TARGET - 2));
        (uint256 c, uint256 w, uint256 available) = vault.getContributorBalance(contributor);
        assertEq(c, 2 * REWARD);
        assertEq(w, 2 * REWARD);
        assertEq(available, 0);
    }

    function test_withdraw_twice_revertsNothingToWithdraw() public {
        uint256 id = _createDefault();
        _approve(id, contributor, _sub(1));
        _withdraw(contributor);
        vm.prank(contributor);
        vm.expectRevert(NothingToWithdraw.selector);
        vault.withdraw();
        assertEq(contributor.balance, REWARD, "paid once");
    }

    function test_withdraw_withoutCredit_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(NothingToWithdraw.selector);
        vault.withdraw();
    }

    function test_withdraw_newCreditsAfterWithdraw() public {
        uint256 id = _createDefault();
        _approve(id, contributor, _sub(1));
        _withdraw(contributor);
        _approve(id, contributor, _sub(2));
        assertEq(_withdrawable(contributor), REWARD);
        _withdraw(contributor);
        assertEq(contributor.balance, 2 * REWARD);
        assertEq(vault.withdrawn(contributor), 2 * REWARD);
    }

    function test_withdraw_worksAfterMissionEnds() public {
        uint256 a = _createDefault();
        uint256 b = _createDefault();
        _complete(a, TARGET, 0);
        _approve(b, contributor, _sub(10));
        vm.prank(buyer);
        vault.cancelMission(b);

        _withdraw(contributor);
        assertEq(contributor.balance, REWARD * (TARGET + 1));
        assertEq(address(vault).balance, 0);
    }

    function test_withdraw_revertsWhenReceiverRejects_andKeepsCredit() public {
        uint256 id = _createDefault();
        RejectingReceiver rejecter = new RejectingReceiver();
        _approve(id, address(rejecter), _sub(1));
        vm.expectRevert(TransferFailed.selector);
        rejecter.withdraw(IMissionVault(address(vault)));
        assertEq(_withdrawable(address(rejecter)), REWARD);
        assertEq(address(vault).balance, REWARD * TARGET);
    }

    function test_withdraw_forwardsAllGas() public {
        // A contract contributor with an expensive receive() can still pull its own funds.
        uint256 id = _createDefault();
        GasHungryReceiver hungry = new GasHungryReceiver(10);
        _approve(id, address(hungry), _sub(1));
        hungry.withdraw(IMissionVault(address(vault)));
        assertEq(address(hungry).balance, REWARD);
        assertEq(hungry.received(), 10);
    }

    function test_withdraw_blocksReentrantWithdraw() public {
        ReentrantReceiver attacker = new ReentrantReceiver(IMissionVault(address(vault)));
        uint256 id = _createDefault();
        _complete(id, 1, 0);
        _approve(id, address(attacker), _sub(5));
        attacker.setReentryCall(abi.encodeCall(IMissionVault.withdraw, ()));

        attacker.withdraw(IMissionVault(address(vault)));

        assertTrue(attacker.reentered());
        assertEq(attacker.reentryError(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
        assertEq(address(attacker).balance, REWARD, "paid exactly once");
        assertEq(vault.withdrawn(address(attacker)), REWARD);
    }

    function test_withdraw_blocksReentrantCancel() public {
        // Attacker is buyer and contributor of the same mission; its withdraw callback tries to cancel.
        ReentrantReceiver attacker = new ReentrantReceiver(IMissionVault(address(vault)));
        vm.deal(address(attacker), 1 ether);
        attacker.createMission{value: REWARD * TARGET}(IMissionFactory(address(factory)), META, REWARD, TARGET);
        uint256 id = attacker.missionId();
        _approve(id, address(attacker), _sub(1));
        attacker.setReentryCall(abi.encodeCall(IMissionVault.cancelMission, (id)));

        attacker.withdraw(IMissionVault(address(vault)));

        assertEq(attacker.reentryError(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
        IMissionVault.Mission memory m = vault.getMission(id);
        assertEq(uint8(m.status), uint8(IMissionVault.MissionStatus.Active));
        assertEq(m.remainingBudget, REWARD * (TARGET - 1));
        assertEq(address(vault).balance, REWARD * (TARGET - 1));
    }

    function test_withdraw_callbackCanCreateMission() public {
        // Re-entering through the Factory is harmless: Vault state is final before the transfer.
        uint256 id = _createDefault();
        FactoryReentrantReceiver nested = new FactoryReentrantReceiver(IMissionFactory(address(factory)));
        _approve(id, address(nested), _sub(1));
        nested.withdraw(IMissionVault(address(vault)));

        uint256 nestedId = nested.createdId();
        assertEq(nestedId, 2);
        assertEq(vault.getMission(nestedId).buyer, address(nested));
        assertEq(vault.getMission(nestedId).remainingBudget, REWARD);
        assertEq(address(vault).balance, REWARD * (TARGET - 1) + REWARD);
        assertEq(_withdrawable(address(nested)), 0);
    }

    function test_withdraw_doesNotCopyReturnBomb() public {
        uint256 id = _create(buyer, REWARD, 4);
        ReturnBombReceiver bomb = new ReturnBombReceiver(1 << 20, true);
        ReturnBombReceiver quiet = new ReturnBombReceiver(1 << 20, false);
        _approve(id, address(bomb), _sub(1));
        _approve(id, address(quiet), _sub(2));
        uint256 withBomb = _withdrawForGas(address(bomb));
        uint256 control = _withdrawForGas(address(quiet));
        emit log_named_uint("withdrawFor gas, 1MB returned", withBomb);
        emit log_named_uint("withdrawFor gas, 0B returned", control);
        assertApproxEqAbs(withBomb, control, 5_000, "returndata was copied");
    }

    function _withdrawForGas(address to) internal returns (uint256 used) {
        vm.prank(stranger);
        uint256 gasBefore = gasleft();
        vault.withdrawFor(to);
        used = gasBefore - gasleft();
        assertEq(to.balance, REWARD);
    }

    function testFuzz_withdraw_paysExactCredit(uint8 n) public {
        uint256 count = _bound(n, 1, 40);
        uint256 id = _create(buyer, REWARD, 40);
        _complete(id, count, 0);
        _withdraw(contributor);
        assertEq(contributor.balance, count * REWARD);
        assertEq(address(vault).balance, (40 - count) * REWARD);
        assertLe(vault.withdrawn(contributor), vault.credited(contributor));
    }

    // --- withdrawFor ---

    function test_withdrawFor_anyoneCanPay_monGoesToContributor() public {
        uint256 id = _createDefault();
        _approve(id, contributor, _sub(1));
        uint256 strangerBefore = stranger.balance;

        vm.expectEmit(address(vault));
        emit IMissionVault.Withdrawn(contributor, REWARD);
        vm.prank(stranger);
        vault.withdrawFor(contributor);

        assertEq(contributor.balance, REWARD);
        assertEq(stranger.balance, strangerBefore);
        assertEq(_withdrawable(contributor), 0);
    }

    function test_withdrawFor_nothing_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(NothingToWithdraw.selector);
        vault.withdrawFor(contributor);
    }

    function test_withdrawFor_gasCapped_hungryReceiverFails_selfWithdrawWorks() public {
        // withdrawFor forwards only WITHDRAW_FOR_GAS, so a helper paying the gas cannot be griefed.
        // The contributor keeps its credit and can still pull with withdraw() (all gas).
        uint256 id = _createDefault();
        GasHungryReceiver hungry = new GasHungryReceiver(10); // ~220k gas in receive()
        _approve(id, address(hungry), _sub(1));

        vm.prank(stranger);
        uint256 gasBefore = gasleft();
        vm.expectRevert(TransferFailed.selector);
        vault.withdrawFor(address(hungry));
        uint256 used = gasBefore - gasleft();
        emit log_named_uint("withdrawFor gas, hungry receiver (reverted)", used);
        // Bounded by the stipend plus fixed call overhead, not by what the receiver wants to burn.
        assertLt(used, vault.WITHDRAW_FOR_GAS() + 100_000);
        assertEq(_withdrawable(address(hungry)), REWARD);

        hungry.withdraw(IMissionVault(address(vault)));
        assertEq(address(hungry).balance, REWARD);
    }

    function test_withdrawFor_smallReceiverWithinStipend() public {
        uint256 id = _createDefault();
        GasHungryReceiver small = new GasHungryReceiver(0); // cheap receive() fits in the stipend
        _approve(id, address(small), _sub(1));
        vm.prank(stranger);
        vault.withdrawFor(address(small));
        assertEq(address(small).balance, REWARD);
    }

    // --- pause ---

    function test_pause_byAdminOrGuardian() public {
        vm.expectEmit(address(vault));
        emit Pausable.Paused(guardian);
        vm.prank(guardian);
        vault.pause();
        assertTrue(vault.paused());

        vm.prank(admin);
        vault.unpause();
        vm.prank(admin);
        vault.pause();
        assertTrue(vault.paused());
    }

    function test_pause_onlyPauser() public {
        bytes32 role = vault.PAUSER_ROLE();
        address[3] memory callers = [stranger, verifier, buyer];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(
                abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, callers[i], role)
            );
            vault.pause();
        }
    }

    function test_unpause_onlyAdmin() public {
        vm.prank(guardian);
        vault.pause();
        bytes32 role = vault.DEFAULT_ADMIN_ROLE();
        vm.prank(guardian);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, guardian, role)
        );
        vault.unpause();

        vm.expectEmit(address(vault));
        emit Pausable.Unpaused(admin);
        vm.prank(admin);
        vault.unpause();
        assertFalse(vault.paused());
    }

    function test_pause_twice_revertsEnforcedPause() public {
        vm.startPrank(guardian);
        vault.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.pause();
        vm.stopPrank();
    }

    function test_unpause_whenNotPaused_revertsExpectedPause() public {
        vm.prank(admin);
        vm.expectRevert(Pausable.ExpectedPause.selector);
        vault.unpause();
    }

    function test_pause_blocksApprove() public {
        uint256 id = _createDefault();
        vm.prank(guardian);
        vault.pause();
        vm.prank(verifier);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.approveSubmission(id, contributor, _sub(1));

        vm.prank(admin);
        vault.unpause();
        _approve(id, contributor, _sub(1));
        assertEq(_withdrawable(contributor), REWARD);
    }

    function test_pause_allowsCancelWithdrawAndWithdrawFor() public {
        uint256 id = _createDefault();
        _approve(id, contributor, _sub(1));
        _approve(id, stranger, _sub(2));
        vm.prank(guardian);
        vault.pause();

        _withdraw(contributor);
        vm.prank(buyer);
        vault.withdrawFor(stranger);
        uint256 before = buyer.balance;
        vm.prank(buyer);
        vault.cancelMission(id);

        assertEq(contributor.balance, REWARD);
        assertEq(stranger.balance, REWARD);
        assertEq(buyer.balance, before + REWARD * (TARGET - 2));
        assertEq(address(vault).balance, 0);
    }

    function test_pause_allowsNewMissions() public {
        // Creating a funded mission moves no MON out; it stays open during an incident.
        vm.prank(guardian);
        vault.pause();
        assertEq(_createDefault(), 1);
    }

    function test_keyLeakRunbook_pauseThenRevoke() public {
        // ARCHITECTURE.md §2 runbook: pause -> revoke -> the leaked key is useless even after unpause.
        uint256 id = _createDefault();
        bytes32 role = vault.VERIFIER_ROLE();
        vm.prank(guardian);
        vault.pause();
        vm.startPrank(admin);
        vault.revokeRole(role, verifier);
        vault.unpause();
        vm.stopPrank();
        vm.prank(verifier);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, verifier, role)
        );
        vault.approveSubmission(id, verifier, _sub(1));
    }
}
