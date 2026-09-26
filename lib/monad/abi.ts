// MissionVault v2 ABI subset used by the server-side adapter (ARCHITECTURE.md v2 §3, §6, §7).
// Kept by hand so the adapter has no build step; `test/abi.test.ts` checks every entry against
// the Foundry artifact (contracts/out/MissionVault.sol/MissionVault.json).

export const missionVaultAbi = [
  {
    type: "function",
    name: "approveSubmission",
    stateMutability: "nonpayable",
    inputs: [
      { name: "missionId", type: "uint256" },
      { name: "contributor", type: "address" },
      { name: "submissionHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawFor",
    stateMutability: "nonpayable",
    inputs: [{ name: "contributor", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getMission",
    stateMutability: "view",
    inputs: [{ name: "missionId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct IMissionVault.Mission",
        components: [
          { name: "buyer", type: "address" },
          { name: "rewardPerSubmission", type: "uint256" },
          { name: "targetCount", type: "uint256" },
          { name: "acceptedCount", type: "uint256" },
          { name: "remainingBudget", type: "uint256" },
          { name: "metadataHash", type: "bytes32" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getSettlement",
    stateMutability: "view",
    inputs: [
      { name: "missionId", type: "uint256" },
      { name: "submissionHash", type: "bytes32" },
    ],
    outputs: [
      { name: "settled", type: "bool" },
      { name: "contributor", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getContributorBalance",
    stateMutability: "view",
    inputs: [{ name: "contributor", type: "address" }],
    // Unnamed in the implementation (G3b report §1): positional [credited, withdrawn, withdrawable].
    outputs: [
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
    ],
  },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  {
    type: "event",
    name: "Settled",
    anonymous: false,
    inputs: [
      { name: "missionId", type: "uint256", indexed: true },
      { name: "submissionHash", type: "bytes32", indexed: true },
      { name: "contributor", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    anonymous: false,
    inputs: [
      { name: "contributor", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "MissionNotActive", inputs: [{ name: "missionId", type: "uint256" }] },
  { type: "error", name: "InvalidSubmission", inputs: [] },
  { type: "error", name: "InvalidContributor", inputs: [] },
  {
    type: "error",
    name: "AlreadySettled",
    inputs: [
      { name: "missionId", type: "uint256" },
      { name: "submissionHash", type: "bytes32" },
    ],
  },
  { type: "error", name: "NothingToWithdraw", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
  { type: "error", name: "EnforcedPause", inputs: [] },
  {
    type: "error",
    name: "AccessControlUnauthorizedAccount",
    inputs: [
      { name: "account", type: "address" },
      { name: "neededRole", type: "bytes32" },
    ],
  },
  { type: "error", name: "ReentrancyGuardReentrantCall", inputs: [] },
] as const;

/** `MissionStatus` enum order in IMissionVault.sol. */
export const MISSION_STATUS = { None: 0, Active: 1, Completed: 2, Cancelled: 3 } as const;

/**
 * Hard gas-limit caps. Monad bills the gas LIMIT, also for reverted txs (G1). Worst cases from the G3b
 * gas report (network = "monad"): approveSubmission max 151,857 → 200k; withdrawFor max 140,162 → 160k
 * (G4 phase-1 §6.4 / L-4: a front-run withdrawFor reverts and is billed on its limit, so keep it tight).
 * If `estimate × 1.15` would exceed the cap, the cap is used; if the estimate itself exceeds it, nothing is sent.
 */
export const GAS_CAP = {
  approveSubmission: BigInt(200_000),
  withdrawFor: BigInt(160_000),
} as const;
