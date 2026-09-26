// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {DeployCore} from "../script/Deploy.s.sol";

/// @notice Runs the same deploy code as script/Deploy.s.sol and checks wiring + roles (G4 F10).
contract DeployTest is Test, DeployCore {
    address internal admin = makeAddr("admin");
    address internal verifier = makeAddr("verifier");
    address internal guardian = makeAddr("guardian");

    function _deployAsAdmin(address guardian_) internal returns (Deployed memory d) {
        vm.startPrank(admin);
        d = _deployAll(admin, verifier, guardian_);
        vm.stopPrank();
    }

    function test_deploy_wiresAndGrantsRolesOnBoth() public {
        Deployed memory d = _deployAsAdmin(guardian);
        _check(d, admin, verifier, guardian);

        assertEq(d.vault.factory(), address(d.factory));
        assertTrue(d.vault.hasRole(d.vault.VERIFIER_ROLE(), verifier));
        assertTrue(d.registry.hasRole(d.registry.VERIFIER_ROLE(), verifier));
        assertTrue(d.vault.hasRole(d.vault.PAUSER_ROLE(), guardian));
        assertTrue(d.registry.hasRole(d.registry.PAUSER_ROLE(), guardian));
        assertTrue(d.vault.hasRole(d.vault.PAUSER_ROLE(), admin));
        assertTrue(d.registry.hasRole(d.registry.PAUSER_ROLE(), admin));
    }

    function test_deploy_verifierHasNoAdminOrPauserRole() public {
        Deployed memory d = _deployAsAdmin(guardian);
        assertFalse(d.vault.hasRole(d.vault.DEFAULT_ADMIN_ROLE(), verifier));
        assertFalse(d.registry.hasRole(d.registry.DEFAULT_ADMIN_ROLE(), verifier));
        assertFalse(d.vault.hasRole(d.vault.PAUSER_ROLE(), verifier));
        assertFalse(d.registry.hasRole(d.registry.PAUSER_ROLE(), verifier));
    }

    function test_deploy_guardianCanPauseButNotUnpause() public {
        Deployed memory d = _deployAsAdmin(guardian);
        vm.startPrank(guardian);
        d.vault.pause();
        d.registry.pause();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, guardian, d.vault.DEFAULT_ADMIN_ROLE()
            )
        );
        d.vault.unpause();
        vm.stopPrank();
    }

    function test_deploy_withoutGuardian_onlyAdminPauses() public {
        Deployed memory d = _deployAsAdmin(address(0));
        _check(d, admin, verifier, address(0));
        assertFalse(d.vault.hasRole(d.vault.PAUSER_ROLE(), guardian));
    }

    function test_check_revertsWhenVerifierMissingOnRegistry() public {
        Deployed memory d = _deployAsAdmin(guardian);
        bytes32 role = d.registry.VERIFIER_ROLE();
        vm.prank(admin);
        d.registry.revokeRole(role, verifier);
        vm.expectRevert(abi.encodeWithSelector(DeployCheckFailed.selector, "registry verifier"));
        this.checkExternal(d);
    }

    function checkExternal(Deployed memory d) external view {
        _check(d, admin, verifier, guardian);
    }
}
