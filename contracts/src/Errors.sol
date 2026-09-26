// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Shared custom errors (ARCHITECTURE.md §7). `lib/monad` maps them to readable messages.
// OpenZeppelin adds EnforcedPause(), ExpectedPause() and AccessControlUnauthorizedAccount(address,bytes32).

error ZeroAddress();
error FactoryAlreadySet();
error InvalidFactory();
error OnlyFactory();
error InvalidReward();
error InvalidTarget();
error InvalidMetadata();
error IncorrectFunding(uint256 expected, uint256 actual);
error MissionNotActive(uint256 missionId);
error MissionNotEnded(uint256 missionId);
error NotBuyer(uint256 missionId);
error InvalidSubmission();
error AlreadySettled(uint256 missionId, bytes32 submissionHash);
error NothingToWithdraw();
error TransferFailed();
error NotAnchored(uint256 missionId);
error AlreadyFinalized(uint256 missionId);
error SampleCountMismatch(uint256 expected, uint256 actual);
error InvalidRoot();
