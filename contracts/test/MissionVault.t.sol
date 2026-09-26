// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {stdError} from "forge-std/StdError.sol";
import {BaseTest} from "./utils/BaseTest.sol";
import {RejectingReceiver, ReentrantReceiver, ReturnBombReceiver, FactoryReentrantReceiver} from "./utils/Mocks.sol";
import {MissionVault} from "../src/MissionVault.sol";
import {IMissionVault} from "../src/interfaces/IMissionVault.sol";
import {IMissionFactory} from "../src/interfaces/IMissionFactory.sol";
import {
    ZeroAddress,
    FactoryAlreadySet,
    OnlyFactory,
    InvalidReward,
    InvalidTarget,
    InvalidMetadata,
    IncorrectFunding,
    MissionNotActive,
    NotBuyer,
    InvalidSubmission,
    AlreadyPaid,
    TransferFailed
} from "../src/Errors.sol";

contract MissionVaultTest is BaseTest {
    // --- constructor / setFactory ---

    function test_constructor_setsAdminAndFirstId() public view {
        assertTrue(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), admin));
        assertEq(vault.nextMissionId(), 1);
        assertEq(vault.factory(), address(factory));
        assertEq(vault.MAX_TARGET(), 100_000);
    }

    function test_constructor_revertsOnZeroAdmin() public {
        vm.expectRevert(ZeroAddress.selector);
        new MissionVault(address(0));
    }

    function test_setFactory_revertsWhenAlreadySet() public {
        vm.prank(admin);
        vm.expectRevert(FactoryAlreadySet.selector);
        vault.setFactory(stranger);
    }

    function test_setFactory_revertsOnZeroAddress() public {
        MissionVault fresh = new MissionVault(admin);
        vm.prank(admin);
        vm.expectRevert(ZeroAddress.selector);
        fresh.setFactory(address(0));
    }

    function test_setFactory_onlyAdmin() public {
        MissionVault fresh = new MissionVault(admin);
        bytes32 role = fresh.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        fresh.setFactory(address(factory));
    }

    // --- registerMission ---

    function test_registerMission_onlyFactory() public {
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        vm.expectRevert(OnlyFactory.selector);
        vault.registerMission{value: 0.3 ether}(stranger, META, REWARD, TARGET);
    }

    function test_registerMission_storesMissionAndEmits() public {
        vm.expectEmit(address(vault));
        emit IMissionVault.MissionFunded(1, buyer, REWARD * TARGET);
        uint256 id = _createDefault();

        assertEq(id, 1);
        assertEq(vault.nextMissionId(), 2);
        IMissionVault.Mission memory m = vault.getMission(id);
        assertEq(m.buyer, buyer);
        assertEq(m.rewardPerSubmission, REWARD);
        assertEq(m.targetCount, TARGET);
        assertEq(m.acceptedCount, 0);
        assertEq(m.remainingBudget, REWARD * TARGET);
        assertEq(m.metadataHash, META);
        assertEq(uint8(m.status), uint8(IMissionVault.MissionStatus.Active));
        assertEq(address(vault).balance, REWARD * TARGET);
    }

    function test_registerMission_idsIncrement() public {
        assertEq(_createDefault(), 1);
        assertEq(_createDefault(), 2);
        assertEq(_createDefault(), 3);
    }

    function test_registerMission_revertsOnZeroMetadata() public {
        vm.prank(buyer);
        vm.expectRevert(InvalidMetadata.selector);
        factory.createMission{value: 0.3 ether}(bytes32(0), REWARD, TARGET);
    }

    function test_registerMission_revertsOnZeroReward() public {
        vm.prank(buyer);
        vm.expectRevert(InvalidReward.selector);
        factory.createMission{value: 0}(META, 0, TARGET);
    }

    function test_registerMission_revertsOnZeroTarget() public {
        vm.prank(buyer);
        vm.expectRevert(InvalidTarget.selector);
        factory.createMission{value: 0}(META, REWARD, 0);
    }

    function test_registerMission_revertsAboveMaxTarget() public {
        uint256 target = vault.MAX_TARGET() + 1;
        vm.deal(buyer, REWARD * target);
        vm.prank(buyer);
        vm.expectRevert(InvalidTarget.selector);
        factory.createMission{value: REWARD * target}(META, REWARD, target);
    }

    function test_registerMission_acceptsMaxTarget() public {
        uint256 target = vault.MAX_TARGET();
        uint256 reward = 1 gwei;
        vm.deal(buyer, reward * target);
        uint256 id = _create(buyer, reward, target);
        assertEq(vault.getMission(id).targetCount, target);
    }

    function test_registerMission_revertsOnUnderfunding() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IncorrectFunding.selector, REWARD * TARGET, REWARD * TARGET - 1));
        factory.createMission{value: REWARD * TARGET - 1}(META, REWARD, TARGET);
    }

    function test_registerMission_revertsOnOverfunding() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IncorrectFunding.selector, REWARD * TARGET, REWARD * TARGET + 1));
        factory.createMission{value: REWARD * TARGET + 1}(META, REWARD, TARGET);
    }

    function test_registerMission_revertsOnRewardOverflow() public {
        vm.prank(buyer);
        vm.expectRevert(stdError.arithmeticError);
        factory.createMission{value: 1}(META, type(uint256).max, 2);
    }

    function test_registerMission_revertsOnZeroBuyer() public {
        // Only reachable if the factory forwarded address(0); impersonate the factory.
        vm.deal(address(factory), 1 ether);
        vm.prank(address(factory));
        vm.expectRevert(ZeroAddress.selector);
        vault.registerMission{value: 0.3 ether}(address(0), META, REWARD, TARGET);
    }

    function testFuzz_registerMission_fundsExactly(uint256 reward, uint256 target) public {
        reward = _bound(reward, 1, 10 ether);
        target = _bound(target, 1, vault.MAX_TARGET());
        uint256 total = reward * target;
        vm.deal(buyer, total);
        uint256 id = _create(buyer, reward, target);
        IMissionVault.Mission memory m = vault.getMission(id);
        assertEq(m.remainingBudget, total);
        assertEq(address(vault).balance, total);
    }

    function testFuzz_registerMission_rejectsWrongValue(uint256 value) public {
        value = _bound(value, 0, 100 ether);
        vm.assume(value != REWARD * TARGET);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IncorrectFunding.selector, REWARD * TARGET, value));
        factory.createMission{value: value}(META, REWARD, TARGET);
    }

    // --- approveSubmission ---

    function test_approve_paysContributorAndEmits() public {
        uint256 id = _createDefault();
        vm.expectEmit(address(vault));
        emit IMissionVault.SubmissionApproved(id, contributor, _sub(1), REWARD);
        _approve(id, contributor, _sub(1));

        assertEq(contributor.balance, REWARD);
        assertEq(address(vault).balance, REWARD * (TARGET - 1));
        IMissionVault.Mission memory m = vault.getMission(id);
        assertEq(m.acceptedCount, 1);
        assertEq(m.remainingBudget, REWARD * (TARGET - 1));
        assertEq(uint8(m.status), uint8(IMissionVault.MissionStatus.Active));
        assertTrue(vault.submissionPaid(_sub(1)));
    }

    function test_approve_completesAtTarget() public {
        uint256 id = _createDefault();
        _complete(id, TARGET - 1, 0);

        vm.expectEmit(address(vault));
        emit IMissionVault.SubmissionApproved(id, contributor, _sub(TARGET - 1), REWARD);
        vm.expectEmit(address(vault));
        emit IMissionVault.MissionCompleted(id, TARGET);
        _approve(id, contributor, _sub(TARGET - 1));

        IMissionVault.Mission memory m = vault.getMission(id);
        assertEq(uint8(m.status), uint8(IMissionVault.MissionStatus.Completed));
        assertEq(m.acceptedCount, TARGET);
        assertEq(m.remainingBudget, 0);
        assertEq(address(vault).balance, 0);
        assertEq(contributor.balance, REWARD * TARGET);
    }

    function test_approve_revertsAfterCompleted() public {
        uint256 id = _createDefault();
        _complete(id, TARGET, 0);
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(MissionNotActive.selector, id));
        vault.approveSubmission(id, contributor, _sub(99));
    }

    function test_approve_revertsAfterCancelled() public {
        uint256 id = _createDefault();
        vm.prank(buyer);
        vault.cancelMission(id);
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(MissionNotActive.selector, id));
        vault.approveSubmission(id, contributor, _sub(1));
    }

    function test_approve_revertsOnUnknownMission() public {
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(MissionNotActive.selector, 42));
        vault.approveSubmission(42, contributor, _sub(1));
    }

    function test_approve_onlyVerifier() public {
        uint256 id = _createDefault();
        bytes32 role = vault.VERIFIER_ROLE();
        address[3] memory callers = [stranger, buyer, admin];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(
                abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, callers[i], role)
            );
            vault.approveSubmission(id, contributor, _sub(1));
        }
    }

    function test_approve_revertsOnZeroContributor() public {
        uint256 id = _createDefault();
        vm.prank(verifier);
        vm.expectRevert(ZeroAddress.selector);
        vault.approveSubmission(id, address(0), _sub(1));
    }

    function test_approve_revertsOnZeroHash() public {
        uint256 id = _createDefault();
        vm.prank(verifier);
        vm.expectRevert(InvalidSubmission.selector);
        vault.approveSubmission(id, contributor, bytes32(0));
    }

    function test_approve_revertsOnDuplicateHashSameMission() public {
        uint256 id = _createDefault();
        _approve(id, contributor, _sub(1));
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(AlreadyPaid.selector, _sub(1)));
        vault.approveSubmission(id, stranger, _sub(1));
    }

    function test_approve_revertsOnDuplicateHashAcrossMissions() public {
        uint256 a = _createDefault();
        uint256 b = _createDefault();
        _approve(a, contributor, _sub(1));
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(AlreadyPaid.selector, _sub(1)));
        vault.approveSubmission(b, contributor, _sub(1));
    }

    function test_approve_revertsWhenContributorRejectsMon() public {
        uint256 id = _createDefault();
        RejectingReceiver rejecter = new RejectingReceiver();
        vm.prank(verifier);
        vm.expectRevert(TransferFailed.selector);
        vault.approveSubmission(id, address(rejecter), _sub(1));

        // Nothing changed: the same hash can still be paid to a working address.
        assertFalse(vault.submissionPaid(_sub(1)));
        assertEq(vault.getMission(id).acceptedCount, 0);
        _approve(id, contributor, _sub(1));
        assertEq(contributor.balance, REWARD);
    }

    function test_approve_blocksReentrancy() public {
        ReentrantReceiver attacker = new ReentrantReceiver(IMissionVault(address(vault)));
        vm.deal(address(attacker), 1 ether);
        attacker.createMission{value: REWARD * TARGET}(IMissionFactory(address(factory)), META, REWARD, TARGET);
        uint256 id = attacker.missionId();

        _approve(id, address(attacker), _sub(1));

        assertTrue(attacker.reentered());
        assertEq(attacker.reentryError(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
        IMissionVault.Mission memory m = vault.getMission(id);
        assertEq(uint8(m.status), uint8(IMissionVault.MissionStatus.Active));
        assertEq(m.remainingBudget, REWARD * (TARGET - 1));
        assertEq(address(vault).balance, REWARD * (TARGET - 1));
    }

    function test_approve_doesNotCopyReturnBomb() public {
        // A contributor returning 1 MB must not make the verifier pay to copy it
        // (Monad bills the full gas limit, so the backend would have to estimate for it).
        uint256 id = _create(buyer, REWARD, 4);
        _approve(id, contributor, _sub(0)); // warm-up: both measured calls then pay the same SSTOREs
        uint256 withBomb = _approveGas(id, address(new ReturnBombReceiver(1 << 20, true)), _sub(1));
        uint256 control = _approveGas(id, address(new ReturnBombReceiver(1 << 20, false)), _sub(2));
        emit log_named_uint("approve gas, 1MB returned", withBomb);
        emit log_named_uint("approve gas, 0B returned", control);
        assertApproxEqAbs(withBomb, control, 5_000, "returndata was copied");
    }

    function _approveGas(uint256 id, address to, bytes32 h) internal returns (uint256 used) {
        vm.prank(verifier);
        uint256 gasBefore = gasleft();
        vault.approveSubmission(id, to, h);
        used = gasBefore - gasleft();
        assertEq(to.balance, REWARD);
    }

    function test_approve_contributorCanCreateMissionInCallback() public {
        // Re-entering through the Factory is harmless: Vault state is final before the payout.
        uint256 id = _createDefault();
        FactoryReentrantReceiver nested = new FactoryReentrantReceiver(IMissionFactory(address(factory)));
        _approve(id, address(nested), _sub(1));

        uint256 nestedId = nested.createdId();
        assertEq(nestedId, 2);
        assertEq(vault.getMission(nestedId).buyer, address(nested));
        assertEq(vault.getMission(id).remainingBudget, REWARD * (TARGET - 1));
        assertEq(address(vault).balance, REWARD * (TARGET - 1) + REWARD);
    }

    function test_forcedMon_doesNotChangeAccounting() public {
        // MON can be forced in (selfdestruct, rewards). The Vault never reads its own balance,
        // so payouts and refunds stay exact and the surplus simply stays in the contract.
        uint256 id = _createDefault();
        vm.deal(address(vault), address(vault).balance + 1 ether);

        _approve(id, contributor, _sub(1));
        uint256 before = buyer.balance;
        vm.prank(buyer);
        vault.cancelMission(id);

        assertEq(contributor.balance, REWARD);
        assertEq(buyer.balance, before + REWARD * (TARGET - 1));
        assertEq(address(vault).balance, 1 ether);
    }

    // --- cancelMission ---

    function test_cancel_refundsRemainingAndEmits() public {
        uint256 id = _createDefault();
        _approve(id, contributor, _sub(1));
        uint256 before = buyer.balance;

        vm.expectEmit(address(vault));
        emit IMissionVault.MissionCancelled(id, REWARD * (TARGET - 1));
        vm.prank(buyer);
        vault.cancelMission(id);

        assertEq(buyer.balance, before + REWARD * (TARGET - 1));
        assertEq(address(vault).balance, 0);
        IMissionVault.Mission memory m = vault.getMission(id);
        assertEq(uint8(m.status), uint8(IMissionVault.MissionStatus.Cancelled));
        assertEq(m.remainingBudget, 0);
        assertEq(m.acceptedCount, 1);
    }

    function test_cancel_onlyBuyer() public {
        uint256 id = _createDefault();
        address[3] memory callers = [stranger, verifier, admin];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(abi.encodeWithSelector(NotBuyer.selector, id));
            vault.cancelMission(id);
        }
    }

    function test_cancel_revertsTwice() public {
        uint256 id = _createDefault();
        vm.startPrank(buyer);
        vault.cancelMission(id);
        vm.expectRevert(abi.encodeWithSelector(MissionNotActive.selector, id));
        vault.cancelMission(id);
        vm.stopPrank();
    }

    function test_cancel_revertsWhenCompleted() public {
        uint256 id = _createDefault();
        _complete(id, TARGET, 0);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(MissionNotActive.selector, id));
        vault.cancelMission(id);
    }

    function test_cancel_revertsOnUnknownMission() public {
        // Unknown mission has buyer == address(0), so the buyer check fails first.
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(NotBuyer.selector, 7));
        vault.cancelMission(7);
    }

    function test_cancel_revertsWhenBuyerRejectsRefund() public {
        RejectingReceiver rejecter = new RejectingReceiver();
        vm.deal(address(rejecter), 1 ether);
        uint256 id =
            rejecter.createMission{value: REWARD * TARGET}(IMissionFactory(address(factory)), META, REWARD, TARGET);
        vm.expectRevert(TransferFailed.selector);
        rejecter.cancel(IMissionVault(address(vault)), id);
        assertEq(uint8(vault.getMission(id).status), uint8(IMissionVault.MissionStatus.Active));
        assertEq(address(vault).balance, REWARD * TARGET);
    }

    function test_cancel_doesNotTouchOtherMissions() public {
        uint256 a = _createDefault();
        uint256 b = _createDefault();
        vm.prank(buyer);
        vault.cancelMission(a);
        assertEq(address(vault).balance, REWARD * TARGET);
        assertEq(vault.getMission(b).remainingBudget, REWARD * TARGET);
        _approve(b, contributor, _sub(1));
    }

    // --- misc ---

    function test_rejectsPlainTransfers() public {
        vm.prank(buyer);
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertFalse(ok);
        vm.prank(buyer);
        (ok,) = address(vault).call{value: 1 ether}(hex"deadbeef");
        assertFalse(ok);
        assertEq(address(vault).balance, 0);
    }

    function test_getMission_unknownIsEmpty() public view {
        IMissionVault.Mission memory m = vault.getMission(123);
        assertEq(m.buyer, address(0));
        assertEq(uint8(m.status), uint8(IMissionVault.MissionStatus.None));
    }

    function test_revokedVerifierCannotApprove() public {
        uint256 id = _createDefault();
        bytes32 role = vault.VERIFIER_ROLE();
        vm.prank(admin);
        vault.revokeRole(role, verifier);
        vm.prank(verifier);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, verifier, role)
        );
        vault.approveSubmission(id, contributor, _sub(1));
    }
}
