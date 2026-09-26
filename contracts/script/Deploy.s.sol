// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MissionVault} from "../src/MissionVault.sol";
import {MissionFactory} from "../src/MissionFactory.sol";
import {ProvenanceRegistry} from "../src/ProvenanceRegistry.sol";
import {IMissionVault} from "../src/interfaces/IMissionVault.sol";

/// @notice Deploys and wires Vault → Factory → Registry, then grants roles (ARCHITECTURE.md §2).
///         Shared by the broadcast script and by test/Deploy.t.sol so both run the same code.
abstract contract DeployCore {
    struct Deployed {
        MissionVault vault;
        MissionFactory factory;
        ProvenanceRegistry registry;
    }

    error DeployCheckFailed(string what);

    function _deployAll(address admin, address verifier, address guardian) internal returns (Deployed memory d) {
        d.vault = new MissionVault(admin);
        d.factory = new MissionFactory(IMissionVault(address(d.vault)));
        d.vault.setFactory(address(d.factory));
        d.registry = new ProvenanceRegistry(admin, IMissionVault(address(d.vault)));

        d.vault.grantRole(d.vault.VERIFIER_ROLE(), verifier);
        d.registry.grantRole(d.registry.VERIFIER_ROLE(), verifier);
        if (guardian != address(0)) {
            d.vault.grantRole(d.vault.PAUSER_ROLE(), guardian);
            d.registry.grantRole(d.registry.PAUSER_ROLE(), guardian);
        }
    }

    /// @dev Reverts when any wiring or role is wrong, so a bad deploy is never broadcast.
    function _check(Deployed memory d, address admin, address verifier, address guardian) internal view {
        if (d.vault.factory() != address(d.factory)) revert DeployCheckFailed("vault.factory");
        if (address(d.factory.vault()) != address(d.vault)) revert DeployCheckFailed("factory.vault");
        if (address(d.registry.vault()) != address(d.vault)) revert DeployCheckFailed("registry.vault");

        if (!d.vault.hasRole(d.vault.DEFAULT_ADMIN_ROLE(), admin)) revert DeployCheckFailed("vault admin");
        if (!d.registry.hasRole(d.registry.DEFAULT_ADMIN_ROLE(), admin)) revert DeployCheckFailed("registry admin");
        if (!d.vault.hasRole(d.vault.VERIFIER_ROLE(), verifier)) revert DeployCheckFailed("vault verifier");
        if (!d.registry.hasRole(d.registry.VERIFIER_ROLE(), verifier)) revert DeployCheckFailed("registry verifier");
        // The verifier must not be able to manage roles or pause.
        if (d.vault.hasRole(d.vault.DEFAULT_ADMIN_ROLE(), verifier)) {
            revert DeployCheckFailed("verifier is vault admin");
        }
        if (d.registry.hasRole(d.registry.DEFAULT_ADMIN_ROLE(), verifier)) {
            revert DeployCheckFailed("verifier is registry admin");
        }
        if (guardian != address(0)) {
            if (!d.vault.hasRole(d.vault.PAUSER_ROLE(), guardian)) revert DeployCheckFailed("vault guardian");
            if (!d.registry.hasRole(d.registry.PAUSER_ROLE(), guardian)) revert DeployCheckFailed("registry guardian");
        }
    }
}

/// @notice Monad testnet deploy. The admin key never leaves the Foundry keystore.
///
///   export ADMIN_ADDRESS=0x...  VERIFIER_ADDRESS=0x...  GUARDIAN_ADDRESS=0x...   # GUARDIAN optional
///   # dry run on a fork (no broadcast, no password):
///   forge script script/Deploy.s.sol --fork-url https://testnet-rpc.monad.xyz --sender $ADMIN_ADDRESS
///   # real deploy (asks for the keystore password):
///   forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz \
///     --account dbforge-admin --sender $ADMIN_ADDRESS --broadcast
contract Deploy is Script, DeployCore {
    function run() external returns (Deployed memory d) {
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        address guardian = vm.envOr("GUARDIAN_ADDRESS", address(0));

        require(verifier != admin, "verifier must differ from admin");
        require(guardian != verifier, "guardian must differ from verifier");
        if (guardian == address(0)) console2.log("WARNING: GUARDIAN_ADDRESS not set - only the admin can pause");

        vm.startBroadcast(admin);
        d = _deployAll(admin, verifier, guardian);
        vm.stopBroadcast();

        _check(d, admin, verifier, guardian);

        console2.log("chainId          ", block.chainid);
        console2.log("MissionVault      ", address(d.vault));
        console2.log("MissionFactory    ", address(d.factory));
        console2.log("ProvenanceRegistry", address(d.registry));
        console2.log("admin             ", admin);
        console2.log("verifier          ", verifier);
        console2.log("guardian          ", guardian);
    }
}
