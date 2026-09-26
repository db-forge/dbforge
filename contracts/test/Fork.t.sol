// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Hashes} from "@openzeppelin/contracts/utils/cryptography/Hashes.sol";
import {BaseTest} from "./utils/BaseTest.sol";
import {IMissionVault} from "../src/interfaces/IMissionVault.sol";

/// @notice Full flow against a Monad testnet fork. Runs only when forked:
///   forge test --fork-url https://testnet-rpc.monad.xyz --match-contract Fork -vv
/// Without a fork the tests are skipped.
contract MonadForkTest is BaseTest {
    uint256 internal constant MONAD_TESTNET_CHAIN_ID = 10143;

    function setUp() public override {
        if (block.chainid != MONAD_TESTNET_CHAIN_ID) return;
        super.setUp();
    }

    function test_fork_deployCreateApproveAnchorFinalize() public {
        vm.skip(block.chainid != MONAD_TESTNET_CHAIN_ID);
        emit log_named_uint("fork block", block.number);

        uint256 id = _create(buyer, REWARD, 2);
        assertEq(address(vault).balance, REWARD * 2);

        _approve(id, contributor, _sub(1));
        _approve(id, contributor, _sub(2));

        IMissionVault.Mission memory m = vault.getMission(id);
        assertEq(uint8(m.status), uint8(IMissionVault.MissionStatus.Completed));
        assertEq(contributor.balance, REWARD * 2);
        assertEq(address(vault).balance, 0);

        bytes32 l1 = keccak256(bytes.concat(keccak256(abi.encode(_sub(1)))));
        bytes32 l2 = keccak256(bytes.concat(keccak256(abi.encode(_sub(2)))));
        vm.prank(verifier);
        registry.anchorDataset(id, Hashes.commutativeKeccak256(l1, l2), 2, keccak256("manifest"));

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = l2;
        assertTrue(registry.verifySample(id, _sub(1), proof));

        vm.prank(buyer);
        registry.finalizeDataset(id);
        assertTrue(registry.getDataset(id).finalized);
    }

    function test_fork_createAndCancelRefunds() public {
        vm.skip(block.chainid != MONAD_TESTNET_CHAIN_ID);
        uint256 id = _createDefault();
        _approve(id, contributor, _sub(1));
        uint256 before = buyer.balance;
        vm.prank(buyer);
        vault.cancelMission(id);
        assertEq(buyer.balance, before + REWARD * (TARGET - 1));
        assertEq(address(vault).balance, 0);
    }
}
