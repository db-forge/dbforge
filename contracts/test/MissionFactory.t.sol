// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {BaseTest} from "./utils/BaseTest.sol";
import {MissionFactory} from "../src/MissionFactory.sol";
import {IMissionVault} from "../src/interfaces/IMissionVault.sol";
import {IMissionFactory} from "../src/interfaces/IMissionFactory.sol";
import {ZeroAddress, IncorrectFunding} from "../src/Errors.sol";

contract MissionFactoryTest is BaseTest {
    function test_constructor_setsVault() public view {
        assertEq(address(factory.vault()), address(vault));
    }

    function test_constructor_revertsOnZeroVault() public {
        vm.expectRevert(ZeroAddress.selector);
        new MissionFactory(IMissionVault(address(0)));
    }

    function test_createMission_fundsVaultAndEmitsBothEvents() public {
        uint256 total = REWARD * TARGET;
        uint256 buyerBefore = buyer.balance;

        vm.expectEmit(address(vault));
        emit IMissionVault.MissionFunded(1, buyer, total);
        vm.expectEmit(address(factory));
        emit IMissionFactory.MissionCreated(1, buyer, REWARD, TARGET, META);

        vm.prank(buyer);
        uint256 id = factory.createMission{value: total}(META, REWARD, TARGET);

        assertEq(id, 1);
        assertEq(buyer.balance, buyerBefore - total);
        assertEq(address(vault).balance, total);
        assertEq(address(factory).balance, 0);
        assertEq(vault.getMission(id).buyer, buyer, "buyer must be msg.sender, not the factory");
    }

    function test_createMission_returnedIdMatchesEvent() public {
        _createDefault();
        vm.recordLogs();
        uint256 id = _createDefault();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bool found;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(factory) && logs[i].topics[0] == IMissionFactory.MissionCreated.selector) {
                assertEq(uint256(logs[i].topics[1]), id);
                assertEq(address(uint160(uint256(logs[i].topics[2]))), buyer);
                found = true;
            }
        }
        assertTrue(found, "MissionCreated not emitted");
        assertEq(id, 2);
    }

    function test_createMission_bubblesVaultErrors() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IncorrectFunding.selector, REWARD * TARGET, 1));
        factory.createMission{value: 1}(META, REWARD, TARGET);
    }

    function test_createMission_differentBuyersOwnTheirMissions() public {
        vm.deal(stranger, 10 ether);
        uint256 a = _createDefault();
        uint256 b = _create(stranger, REWARD, TARGET);
        assertEq(vault.getMission(a).buyer, buyer);
        assertEq(vault.getMission(b).buyer, stranger);
    }

    function testFuzz_createMission_anyBuyer(address who, uint256 reward, uint256 target) public {
        vm.assume(who != address(0));
        reward = _bound(reward, 1, 1 ether);
        target = _bound(target, 1, 1_000);
        vm.deal(who, reward * target);
        uint256 id = _create(who, reward, target);
        IMissionVault.Mission memory m = vault.getMission(id);
        assertEq(m.buyer, who);
        assertEq(m.remainingBudget, reward * target);
    }
}
