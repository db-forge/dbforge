// GENERATED from contracts/out (forge build) by hand-run extraction; checked entry-by-entry by test/abi.test.ts.
// Browser-side subset of the v2 ABIs (ARCHITECTURE.md v2 §3–§7). Every contract ABI carries ALL custom errors of
// the three contracts, because the Factory bubbles up Vault reverts and viem needs the error to decode its name.

export const dbforgeErrorsAbi = [
  {
    type: "error",
    name: "AccessControlBadConfirmation",
    inputs: [],
  },
  {
    type: "error",
    name: "AccessControlUnauthorizedAccount",
    inputs: [
      {
        name: "account",
        type: "address",
      },
      {
        name: "neededRole",
        type: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "AlreadySettled",
    inputs: [
      {
        name: "missionId",
        type: "uint256",
      },
      {
        name: "submissionHash",
        type: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "EnforcedPause",
    inputs: [],
  },
  {
    type: "error",
    name: "ExpectedPause",
    inputs: [],
  },
  {
    type: "error",
    name: "FactoryAlreadySet",
    inputs: [],
  },
  {
    type: "error",
    name: "IncorrectFunding",
    inputs: [
      {
        name: "expected",
        type: "uint256",
      },
      {
        name: "actual",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidContributor",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidFactory",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidMetadata",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidReward",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidSubmission",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidTarget",
    inputs: [],
  },
  {
    type: "error",
    name: "MissionNotActive",
    inputs: [
      {
        name: "missionId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "NotBuyer",
    inputs: [
      {
        name: "missionId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "NothingToWithdraw",
    inputs: [],
  },
  {
    type: "error",
    name: "OnlyFactory",
    inputs: [],
  },
  {
    type: "error",
    name: "ReentrancyGuardReentrantCall",
    inputs: [],
  },
  {
    type: "error",
    name: "TransferFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "ZeroAddress",
    inputs: [],
  },
  {
    type: "error",
    name: "AlreadyFinalized",
    inputs: [
      {
        name: "missionId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidRoot",
    inputs: [],
  },
  {
    type: "error",
    name: "MissionNotEnded",
    inputs: [
      {
        name: "missionId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "NotAnchored",
    inputs: [
      {
        name: "missionId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "RootMismatch",
    inputs: [
      {
        name: "missionId",
        type: "uint256",
      },
      {
        name: "expected",
        type: "bytes32",
      },
      {
        name: "actual",
        type: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "SampleCountMismatch",
    inputs: [
      {
        name: "expected",
        type: "uint256",
      },
      {
        name: "actual",
        type: "uint256",
      },
    ],
  },
] as const;

export const missionFactoryAbi = [
  ...[
    {
      type: "function",
      name: "createMission",
      inputs: [
        {
          name: "metadataHash",
          type: "bytes32",
        },
        {
          name: "rewardPerSubmission",
          type: "uint256",
        },
        {
          name: "targetCount",
          type: "uint256",
        },
      ],
      outputs: [
        {
          name: "missionId",
          type: "uint256",
        },
      ],
      stateMutability: "payable",
    },
    {
      type: "function",
      name: "vault",
      inputs: [],
      outputs: [
        {
          name: "",
          type: "address",
        },
      ],
      stateMutability: "view",
    },
    {
      type: "event",
      name: "MissionCreated",
      inputs: [
        {
          name: "missionId",
          type: "uint256",
          indexed: true,
        },
        {
          name: "buyer",
          type: "address",
          indexed: true,
        },
        {
          name: "rewardPerSubmission",
          type: "uint256",
          indexed: false,
        },
        {
          name: "targetCount",
          type: "uint256",
          indexed: false,
        },
        {
          name: "metadataHash",
          type: "bytes32",
          indexed: false,
        },
      ],
      anonymous: false,
    },
  ],
  ...dbforgeErrorsAbi,
] as const;

export const missionVaultAbi = [
  ...[
    {
      type: "function",
      name: "cancelMission",
      inputs: [
        {
          name: "missionId",
          type: "uint256",
        },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    },
    {
      type: "function",
      name: "getContributorBalance",
      inputs: [
        {
          name: "contributor",
          type: "address",
        },
      ],
      outputs: [
        {
          name: "",
          type: "uint256",
        },
        {
          name: "",
          type: "uint256",
        },
        {
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "view",
    },
    {
      type: "function",
      name: "getMission",
      inputs: [
        {
          name: "missionId",
          type: "uint256",
        },
      ],
      outputs: [
        {
          name: "",
          type: "tuple",
          internalType: "struct IMissionVault.Mission",
          components: [
            {
              name: "buyer",
              type: "address",
            },
            {
              name: "rewardPerSubmission",
              type: "uint256",
            },
            {
              name: "targetCount",
              type: "uint256",
            },
            {
              name: "acceptedCount",
              type: "uint256",
            },
            {
              name: "remainingBudget",
              type: "uint256",
            },
            {
              name: "metadataHash",
              type: "bytes32",
            },
            {
              name: "status",
              type: "uint8",
            },
          ],
        },
      ],
      stateMutability: "view",
    },
    {
      type: "function",
      name: "getSettlement",
      inputs: [
        {
          name: "missionId",
          type: "uint256",
        },
        {
          name: "submissionHash",
          type: "bytes32",
        },
      ],
      outputs: [
        {
          name: "settled",
          type: "bool",
        },
        {
          name: "contributor",
          type: "address",
        },
        {
          name: "amount",
          type: "uint256",
        },
      ],
      stateMutability: "view",
    },
    {
      type: "function",
      name: "paused",
      inputs: [],
      outputs: [
        {
          name: "",
          type: "bool",
        },
      ],
      stateMutability: "view",
    },
    {
      type: "function",
      name: "withdraw",
      inputs: [],
      outputs: [],
      stateMutability: "nonpayable",
    },
    {
      type: "function",
      name: "withdrawFor",
      inputs: [
        {
          name: "contributor",
          type: "address",
        },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    },
    {
      type: "event",
      name: "MissionCancelled",
      inputs: [
        {
          name: "missionId",
          type: "uint256",
          indexed: true,
        },
        {
          name: "refunded",
          type: "uint256",
          indexed: false,
        },
      ],
      anonymous: false,
    },
    {
      type: "event",
      name: "Settled",
      inputs: [
        {
          name: "missionId",
          type: "uint256",
          indexed: true,
        },
        {
          name: "submissionHash",
          type: "bytes32",
          indexed: true,
        },
        {
          name: "contributor",
          type: "address",
          indexed: true,
        },
        {
          name: "amount",
          type: "uint256",
          indexed: false,
        },
      ],
      anonymous: false,
    },
    {
      type: "event",
      name: "Withdrawn",
      inputs: [
        {
          name: "contributor",
          type: "address",
          indexed: true,
        },
        {
          name: "amount",
          type: "uint256",
          indexed: false,
        },
      ],
      anonymous: false,
    },
  ],
  ...dbforgeErrorsAbi,
] as const;

export const provenanceRegistryAbi = [
  ...[
    {
      type: "function",
      name: "finalizeDataset",
      inputs: [
        {
          name: "missionId",
          type: "uint256",
        },
        {
          name: "expectedRoot",
          type: "bytes32",
        },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    },
    {
      type: "function",
      name: "getDataset",
      inputs: [
        {
          name: "missionId",
          type: "uint256",
        },
      ],
      outputs: [
        {
          name: "",
          type: "tuple",
          internalType: "struct IProvenanceRegistry.Dataset",
          components: [
            {
              name: "merkleRoot",
              type: "bytes32",
            },
            {
              name: "metadataHash",
              type: "bytes32",
            },
            {
              name: "sampleCount",
              type: "uint256",
            },
            {
              name: "anchoredAt",
              type: "uint64",
            },
            {
              name: "finalized",
              type: "bool",
            },
          ],
        },
      ],
      stateMutability: "view",
    },
    {
      type: "function",
      name: "paused",
      inputs: [],
      outputs: [
        {
          name: "",
          type: "bool",
        },
      ],
      stateMutability: "view",
    },
    {
      type: "function",
      name: "verifySample",
      inputs: [
        {
          name: "missionId",
          type: "uint256",
        },
        {
          name: "submissionHash",
          type: "bytes32",
        },
        {
          name: "proof",
          type: "bytes32[]",
        },
      ],
      outputs: [
        {
          name: "",
          type: "bool",
        },
      ],
      stateMutability: "view",
    },
    {
      type: "event",
      name: "DatasetAnchored",
      inputs: [
        {
          name: "missionId",
          type: "uint256",
          indexed: true,
        },
        {
          name: "merkleRoot",
          type: "bytes32",
          indexed: false,
        },
        {
          name: "previousRoot",
          type: "bytes32",
          indexed: false,
        },
        {
          name: "sampleCount",
          type: "uint256",
          indexed: false,
        },
        {
          name: "metadataHash",
          type: "bytes32",
          indexed: false,
        },
      ],
      anonymous: false,
    },
    {
      type: "event",
      name: "DatasetFinalized",
      inputs: [
        {
          name: "missionId",
          type: "uint256",
          indexed: true,
        },
        {
          name: "buyer",
          type: "address",
          indexed: true,
        },
      ],
      anonymous: false,
    },
  ],
  ...dbforgeErrorsAbi,
] as const;
