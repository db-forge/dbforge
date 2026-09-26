// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMissionVault} from "../../src/interfaces/IMissionVault.sol";
import {IMissionFactory} from "../../src/interfaces/IMissionFactory.sol";

/// @dev Lets a contract contributor pull its own balance.
abstract contract Withdrawer {
    function withdraw(IMissionVault vault) external {
        vault.withdraw();
    }
}

/// @dev Has no receive/fallback, so any MON transfer to it fails.
contract RejectingReceiver is Withdrawer {
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

/// @dev Buyer and contributor at once. On the first MON it receives it re-enters the Vault
///      with `reentryCall` (e.g. withdraw() or cancelMission(id)) and records the revert data.
contract ReentrantReceiver is Withdrawer {
    IMissionVault public immutable vault;
    uint256 public missionId;
    bytes public reentryCall;
    bytes public reentryError;
    bool public reentered;

    constructor(IMissionVault vault_) {
        vault = vault_;
    }

    function createMission(IMissionFactory factory, bytes32 meta, uint256 reward, uint256 target) external payable {
        missionId = factory.createMission{value: msg.value}(meta, reward, target);
    }

    function setReentryCall(bytes calldata data) external {
        reentryCall = data;
    }

    function cancel() external {
        vault.cancelMission(missionId);
    }

    receive() external payable {
        if (reentered) return;
        reentered = true;
        (bool ok, bytes memory err) = address(vault).call(reentryCall);
        // A successful re-entry leaves reentryError empty, so the test fails.
        if (!ok) reentryError = err;
    }
}

/// @dev Accepts MON, expands its memory to `size` bytes and returns all of it (`bomb`) or nothing.
///      The two variants cost the receiver the same, so any gas difference is the caller's copy cost.
contract ReturnBombReceiver is Withdrawer {
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

/// @dev Accepts MON only with enough gas: writes `slots` fresh storage slots (~22k gas each).
contract GasHungryReceiver is Withdrawer {
    uint256 public immutable slots;
    mapping(uint256 => uint256) public sink;
    uint256 public received;

    constructor(uint256 slots_) {
        slots = slots_;
    }

    receive() external payable {
        uint256 base = received;
        for (uint256 i; i < slots; ++i) {
            sink[base + i] = 1;
        }
        received = base + slots;
    }
}

/// @dev Contributor that opens a new mission from inside its withdraw callback.
contract FactoryReentrantReceiver is Withdrawer {
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

/// @dev Factory look-alike whose `vault()` points somewhere else (setFactory must reject it).
contract WrongVaultFactory {
    address public immutable vault;

    constructor(address vault_) {
        vault = vault_;
    }
}

/// @dev Contract without a `vault()` function (setFactory must reject it).
contract NoVaultContract {
    uint256 public x;
}

/// @dev Answers every call with empty returndata (setFactory must reject it).
contract SilentFallback {
    fallback() external {}
}

/// @dev Sends MON into any address with selfdestruct (Cancun: the contract stays, the value moves).
contract ForceSender {
    constructor(address payable to) payable {
        selfdestruct(to);
    }
}
