// Read-only chain access for the G6c helpers (merkle.ts, mission.ts, dataset.ts). No key, no writes.
// Reuses the adapter's env parsing (config.ts) and adds the Factory / Registry addresses the reads need.

import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  isAddress,
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";
import { loadConfigFromEnv, MonadConfigError } from "./config";
import { mapChainError } from "./chain";

/** Read-side ABI fragments (kept here so the adapter's abi.ts stays unchanged). */
export const readAbi = parseAbi([
  "event Settled(uint256 indexed missionId, bytes32 indexed submissionHash, address indexed contributor, uint256 amount)",
  "event MissionCreated(uint256 indexed missionId, address indexed buyer, uint256 rewardPerSubmission, uint256 targetCount, bytes32 metadataHash)",
  "function getMission(uint256 missionId) view returns ((address buyer, uint256 rewardPerSubmission, uint256 targetCount, uint256 acceptedCount, uint256 remainingBudget, bytes32 metadataHash, uint8 status))",
  "function getDataset(uint256 missionId) view returns ((bytes32 merkleRoot, bytes32 metadataHash, uint256 sampleCount, uint64 anchoredAt, bool finalized))",
  "function verifySample(uint256 missionId, bytes32 submissionHash, bytes32[] proof) view returns (bool)",
]);

export interface MonadReader {
  client: PublicClient;
  vault: Address;
  /** Needed by readMissionCreated. */
  factory?: Address;
  /** Needed by getDataset / getSampleProof. */
  registry?: Address;
  /** First block for Settled log scans (Vault deploy block). */
  fromBlock: bigint;
  /** eth_getLogs block range per request. */
  logChunkSize: bigint;
}

type Env = Record<string, string | undefined>;

function optionalAddress(env: Env, name: string): Address | undefined {
  const raw = env[name];
  if (raw === undefined || raw === "") return undefined;
  if (!isAddress(raw, { strict: false })) throw new MonadConfigError(`${name} must be a contract address.`);
  return getAddress(raw);
}

/**
 * Env: the adapter's MONAD_RPC_URL / MONAD_CHAIN_ID / MONAD_VAULT_ADDRESS / MONAD_VAULT_DEPLOY_BLOCK /
 * MONAD_LOG_CHUNK_BLOCKS, plus MONAD_FACTORY_ADDRESS and MONAD_REGISTRY_ADDRESS (optional here; the function
 * that needs one fails with INVALID_INPUT reason READER_NOT_CONFIGURED when it is missing).
 */
export function createMonadReader(env: Env = process.env): MonadReader {
  const config = loadConfigFromEnv(env);
  const chain = defineChain({
    id: config.chainId,
    name: config.chainId === 10143 ? "Monad Testnet" : `chain-${config.chainId}`,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  return {
    client: createPublicClient({ chain, transport: http(config.rpcUrl) }),
    vault: config.vaultAddress,
    factory: optionalAddress(env, "MONAD_FACTORY_ADDRESS"),
    registry: optionalAddress(env, "MONAD_REGISTRY_ADDRESS"),
    fromBlock: config.vaultDeployBlock,
    logChunkSize: config.logChunkSize,
  };
}

let cached: MonadReader | undefined;

/** Process-wide reader built from process.env on first use. */
export function defaultReader(): MonadReader {
  cached ??= createMonadReader();
  return cached;
}

/** Runs a chain read and maps failures to MonadSettlementError (no raw RPC text). */
export async function readChain<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw mapChainError(e);
  }
}
