// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {stdError} from "forge-std/StdError.sol";
import {BaseTest} from "./utils/BaseTest.sol";
import {
    RejectingReceiver,
    GasHungryReceiver,
    WrongVaultFactory,
    NoVaultContract,
    SilentFallback,
    ForceSender
} from "./utils/Mocks.sol";
import {MissionVault} from "../src/MissionVault.sol";
import {MissionFactory} from "../src/MissionFactory.sol";
import {IMissionVault} from "../src/interfaces/IMissionVault.sol";
import {IMissionFactory} from "../src/interfaces/IMissionFactory.sol";
import {
    ZeroAddress,
    FactoryAlreadySet,
    InvalidFactory,
    OnlyFactory,
    InvalidReward,
    InvalidTarget,
    InvalidMetadata,
    IncorrectFunding,
    MissionNotActive,
    NotBuyer,
    InvalidSubmission,
    AlreadySettled,
    TransferFailed,
    InvalidContributor
} from "../src/Errors.sol";

/// @notice Setup, registration, settlement (credit) and cancel. Withdraw and pause: MissionVaultWithdraw.t.sol.
contract MissionVaultTest is BaseTest {
    // --- constructor / setFactory ---

    function test_constructor_setsAdminPauserAndFirstId() public view {
        assertTrue(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(vault.hasRole(vault.PAUSER_ROLE(), admin));
        assertEq(vault.nextMissionId(), 1);
        assertEq(vault.factory(), address(factory));
        assertEq(vault.MAX_TARGET(), 100_000);
        assertEq(vault.WITHDRAW_FOR_GAS(), 50_000);
        assertEq(vault.PAUSER_ROLE(), keccak256("PAUSER_ROLE"));
        assertFalse(vault.paused());
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
        MissionFactory f = new MissionFactory(IMissionVault(address(fresh)));
        bytes32 role = fresh.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        fresh.setFactory(address(f));
    }

    function test_setFactory_acceptsFactoryOfThisVault() public {
        MissionVault fresh = new MissionVault(admin);
        MissionFactory f = new MissionFactory(IMissionVault(address(fresh)));
        vm.prank(admin);
        fresh.setFactory(address(f));
        assertEq(fresh.factory(), address(f));
    }

    function test_setFactory_revertsOnEoa() public {
        MissionVault fresh = new MissionVault(admin);
        vm.prank(admin);
        vm.expectRevert(InvalidFactory.selector);
        fresh.setFactory(stranger);
    }

    function test_setFactory_revertsOnFactoryOfOtherVault() public {
        MissionVault fresh = new MissionVault(admin);
        vm.prank(admin);
        vm.expectRevert(InvalidFactory.selector);
        fresh.setFactory(address(factory)); // bound to `vault`, not `fresh`
    }

    function test_setFactory_revertsOnContractWithoutVault() public {
        MissionVault fresh = new MissionVault(admin);
        address[3] memory bad = [
            address(new NoVaultContract()),
            address(new SilentFallback()),
            address(new WrongVaultFactory(address(uint160(address(fresh)) + 1)))
        ];
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(admin);
            vm.expectRevert(InvalidFactory.selector);
            fresh.setFactory(bad[i]);
        }
        assertEq(fresh.factory(), address(0));
    }

    function test_setFactory_revertsOnDirtyVaultWord() public {
        // `vault()` returning this address with dirty upper bits is not a valid address.
        MissionVault fresh = new MissionVault(admin);
        address f = makeAddr("dirtyFactory");
        vm.etch(f, hex"00");
        vm.mockCall(
            f, abi.encodeCall(IMissionFactory.vault, ()), abi.encode(uint256(uint160(address(fresh))) | (1 << 200))
        );
        vm.prank(admin);
        vm.expectRevert(InvalidFactory.selector);
        fresh.setFactory(f);
    }

    function test_registerMission_beforeSetFactory_reverts() public {
        MissionVault fresh = new MissionVault(admin);
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        vm.expectRevert(OnlyFactory.selector);
        fresh.registerMission{value: 0.3 ether}(stranger, META, REWARD, TARGET);
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

    // --- approveSubmission (settle = credit, no transfer) ---

    function test_approve_creditsWithoutTransferAndEmits() public {
        uint256 id = _createDefault();
        vm.expectEmit(address(vault));
        emit IMissionVault.Settled(id, _sub(1), contributor, REWARD);
        _approve(id, contributor, _sub(1));

        assertEq(contributor.balance, 0, "no MON leaves the Vault on settlement");
        assertEq(address(vault).balance, REWARD * TARGET);
        IMissionVault.Mission memory m = vault.getMission(id);
        assertEq(m.acceptedCount, 1);
        assertEq(m.remainingBudget, REWARD * (TARGET - 1));
        assertEq(uint8(m.status), uint8(IMissionVault.MissionStatus.Active));

        (bool settled, address who, uint256 amount) = vault.getSettlement(id, _sub(1));
        assertTrue(settled);
        assertEq(who, contributor);
        assertEq(amount, REWARD);
        (uint256 c, uint256 w, uint256 available) = vault.getContributorBalance(contributor);
        assertEq(c, REWARD);
        assertEq(w, 0);
        assertEq(available, REWARD);
        assertEq(vault.credited(contributor), REWARD);
        assertEq(vault.withdrawn(contributor), 0);
    }

    function test_approve_completesAtTarget() public {
        uint256 id = _createDefault();
        _complete(id, TARGET - 1, 0);

        vm.expectEmit(address(vault));
        emit IMissionVault.Settled(id, _sub(TARGET - 1), contributor, REWARD);
        vm.expectEmit(address(vault));
        emit IMissionVault.MissionCompleted(id, TARGET);
        _approve(id, contributor, _sub(TARGET - 1));

        IMissionVault.Mission memory m = vault.getMission(id);
        assertEq(uint8(m.status), uint8(IMissionVault.MissionStatus.Completed));
        assertEq(m.acceptedCount, TARGET);
        assertEq(m.remainingBudget, 0);
        assertEq(address(vault).balance, REWARD * TARGET, "credits stay in the Vault until withdrawn");
        assertEq(_withdrawable(contributor), REWARD * TARGET);
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
        address[4] memory callers = [stranger, buyer, admin, guardian];
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

    /// G4 L-1: the Vault has no receive(), so a credit to itself could never be withdrawn.
    function test_approve_revertsWhenContributorIsVault() public {
        uint256 id = _createDefault();
        vm.prank(verifier);
        vm.expectRevert(InvalidContributor.selector);
        vault.approveSubmission(id, address(vault), _sub(1));
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
        vm.expectRevert(abi.encodeWithSelector(AlreadySettled.selector, id, _sub(1)));
        vault.approveSubmission(id, stranger, _sub(1));
    }

    function test_approve_sameHashInOtherMissionSettles() public {
        // Replay key is (missionId, hash): one file may be settled once per mission (ARCHITECTURE.md v2 #2).
        uint256 a = _createDefault();
        uint256 b = _createDefault();
        _approve(a, contributor, _sub(1));
        _approve(b, stranger, _sub(1));

        (bool sa, address ca,) = vault.getSettlement(a, _sub(1));
        (bool sb, address cb,) = vault.getSettlement(b, _sub(1));
        assertTrue(sa && sb);
        assertEq(ca, contributor);
        assertEq(cb, stranger);

        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(AlreadySettled.selector, b, _sub(1)));
        vault.approveSubmission(b, contributor, _sub(1));
    }

    function test_approve_toContractThatRejectsMon_stillSettles() public {
        // No external call on settlement: a contributor that cannot receive MON only blocks its own withdrawal.
        uint256 id = _createDefault();
        RejectingReceiver rejecter = new RejectingReceiver();
        _approve(id, address(rejecter), _sub(1));
        assertEq(_withdrawable(address(rejecter)), REWARD);
        assertEq(vault.getMission(id).acceptedCount, 1);
    }

    function test_approve_gasDoesNotDependOnContributor() public {
        // F1: settlement gas is bounded whatever the contributor's code does (it is never called).
        uint256 id = _create(buyer, REWARD, 4);
        _approve(id, makeAddr("warm"), _sub(0)); // warm the mission slots
        address eoa = makeAddr("eoa");
        address hungry = address(new GasHungryReceiver(1_000));
        uint256 gasEoa = _approveGas(id, eoa, _sub(1));
        uint256 gasContract = _approveGas(id, hungry, _sub(2));
        emit log_named_uint("approve gas, EOA contributor", gasEoa);
        emit log_named_uint("approve gas, gas-burning contract contributor", gasContract);
        assertEq(gasEoa, gasContract);
        assertLt(gasContract, 150_000);
    }

    function _approveGas(uint256 id, address to, bytes32 h) internal returns (uint256 used) {
        vm.prank(verifier);
        uint256 gasBefore = gasleft();
        vault.approveSubmission(id, to, h);
        used = gasBefore - gasleft();
    }

    function testFuzz_approve_creditsAccumulateAcrossMissions(uint8 countA, uint8 countB) public {
        uint256 a = _create(buyer, REWARD, 50);
        uint256 b = _create(buyer, 2 * REWARD, 50);
        uint256 na = _bound(countA, 0, 50);
        uint256 nb = _bound(countB, 0, 50);
        for (uint256 i; i < na; ++i) {
            _approve(a, contributor, _sub(i));
        }
        for (uint256 i; i < nb; ++i) {
            _approve(b, contributor, _sub(i)); // same hashes, other mission
        }
        assertEq(vault.credited(contributor), na * REWARD + nb * 2 * REWARD);
        assertEq(_withdrawable(contributor), na * REWARD + nb * 2 * REWARD);
    }

    function test_getSettlement_unknownIsEmpty() public view {
        (bool settled, address who, uint256 amount) = vault.getSettlement(1, _sub(1));
        assertFalse(settled);
        assertEq(who, address(0));
        assertEq(amount, 0);
    }

    function test_forcedMon_doesNotChangeAccounting() public {
        // F9: MON can be forced in (selfdestruct). The Vault never reads its own balance,
        // so credits, withdrawals and refunds stay exact and the surplus simply stays in the contract.
        uint256 id = _createDefault();
        new ForceSender{value: 1 ether}(payable(address(vault)));
        assertEq(address(vault).balance, REWARD * TARGET + 1 ether);

        _approve(id, contributor, _sub(1));
        _withdraw(contributor);
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
        assertEq(address(vault).balance, REWARD, "the settled credit stays for the contributor");
        IMissionVault.Mission memory m = vault.getMission(id);
        assertEq(uint8(m.status), uint8(IMissionVault.MissionStatus.Cancelled));
        assertEq(m.remainingBudget, 0);
        assertEq(m.acceptedCount, 1);

        _withdraw(contributor);
        assertEq(contributor.balance, REWARD);
        assertEq(address(vault).balance, 0);
    }

    function testFuzz_cancel_refundsExactlyRemainingBudget(uint8 k) public {
        uint256 target = 20;
        uint256 settled = _bound(k, 0, target - 1);
        uint256 id = _create(buyer, REWARD, target);
        _complete(id, settled, 0);
        uint256 before = buyer.balance;
        vm.prank(buyer);
        vault.cancelMission(id);
        assertEq(buyer.balance - before, REWARD * (target - settled));
        assertEq(address(vault).balance, REWARD * settled);
    }

    function test_cancel_onlyBuyer() public {
        uint256 id = _createDefault();
        address[4] memory callers = [stranger, verifier, admin, guardian];
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

    function test_cancel_thenApprove_revertsMissionNotActive() public {
        // F4 race, cancel first: the late settlement reverts, nothing is credited.
        uint256 id = _createDefault();
        vm.prank(buyer);
        vault.cancelMission(id);
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(MissionNotActive.selector, id));
        vault.approveSubmission(id, contributor, _sub(1));
        assertEq(vault.credited(contributor), 0);
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
