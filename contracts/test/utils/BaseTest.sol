// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MissionVault} from "../../src/MissionVault.sol";
import {MissionFactory} from "../../src/MissionFactory.sol";
import {ProvenanceRegistry} from "../../src/ProvenanceRegistry.sol";
import {IMissionVault} from "../../src/interfaces/IMissionVault.sol";

abstract contract BaseTest is Test {
    MissionVault internal vault;
    MissionFactory internal factory;
    ProvenanceRegistry internal registry;

    address internal admin = makeAddr("admin");
    address internal verifier = makeAddr("verifier");
    address internal buyer = makeAddr("buyer");
    address internal contributor = makeAddr("contributor");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant META = keccak256("mission-metadata");
    uint256 internal constant REWARD = 0.1 ether;
    uint256 internal constant TARGET = 3;

    function setUp() public virtual {
        vault = new MissionVault(admin);
        factory = new MissionFactory(IMissionVault(address(vault)));
        registry = new ProvenanceRegistry(admin, IMissionVault(address(vault)));

        vm.startPrank(admin);
        vault.setFactory(address(factory));
        vault.grantRole(vault.VERIFIER_ROLE(), verifier);
        registry.grantRole(registry.VERIFIER_ROLE(), verifier);
        vm.stopPrank();

        vm.deal(buyer, 100 ether);
    }

    function _create(address from, uint256 reward, uint256 target) internal returns (uint256) {
        vm.prank(from);
        return factory.createMission{value: reward * target}(META, reward, target);
    }

    function _createDefault() internal returns (uint256) {
        return _create(buyer, REWARD, TARGET);
    }

    function _approve(uint256 missionId, address to, bytes32 submissionHash) internal {
        vm.prank(verifier);
        vault.approveSubmission(missionId, to, submissionHash);
    }

    function _sub(uint256 i) internal pure returns (bytes32) {
        return keccak256(abi.encode("submission", i));
    }

    function _complete(uint256 missionId, uint256 count, uint256 offset) internal {
        for (uint256 i; i < count; ++i) {
            _approve(missionId, contributor, _sub(offset + i));
        }
    }
}
