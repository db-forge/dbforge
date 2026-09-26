// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMissionVault} from "../../src/interfaces/IMissionVault.sol";
import {IMissionFactory} from "../../src/interfaces/IMissionFactory.sol";

/// @dev Has no receive/fallback, so any MON transfer to it fails.
contract RejectingReceiver {
    function createMission(IMissionFactory factory, bytes32 meta, uint256 reward, uint256 target)
        external
        payable
        returns (uint256)
    {
        return factory.createMission{value: msg.value}(meta, reward, target);
    }

    function cancel(IMissionVault vault, uint256 missionId) external {
        vault.cancelMission(missionId);
    }
}

/// @dev Buyer and contributor at once. On payout it tries to re-enter `cancelMission`.
contract ReentrantReceiver {
    IMissionVault public immutable vault;
    uint256 public missionId;
    bytes public reentryError;
    bool public reentered;

    constructor(IMissionVault vault_) {
        vault = vault_;
    }

    function createMission(IMissionFactory factory, bytes32 meta, uint256 reward, uint256 target) external payable {
        missionId = factory.createMission{value: msg.value}(meta, reward, target);
    }

    receive() external payable {
        if (reentered) return;
        reentered = true;
        try vault.cancelMission(missionId) {
        // re-entry succeeded: leave reentryError empty so the test fails
        }
        catch (bytes memory err) {
            reentryError = err;
        }
    }
}

/// @dev Accepts MON, expands its memory to `size` bytes and returns all of it (`bomb`) or nothing.
///      The two variants cost the receiver the same, so any gas difference is the caller's copy cost.
contract ReturnBombReceiver {
    uint256 public immutable size;
    bool public immutable bomb;

    constructor(uint256 size_, bool bomb_) {
        size = size_;
        bomb = bomb_;
    }

    receive() external payable {
        uint256 n = size;
        uint256 out = bomb ? n : 0;
        assembly {
            mstore(sub(n, 32), 1)
            return(0, out)
        }
    }
}

/// @dev Contributor that opens a new mission from inside its payout callback.
contract FactoryReentrantReceiver {
    IMissionFactory public immutable factory;
    uint256 public createdId;

    constructor(IMissionFactory factory_) {
        factory = factory_;
    }

    receive() external payable {
        if (createdId != 0) return;
        createdId = factory.createMission{value: msg.value}(keccak256("nested"), msg.value, 1);
    }
}
