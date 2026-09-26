import { getAddress, isAddress, type Address, type Hex } from "viem";

/** Everything the adapter needs except the signing key (kept out of this object so it can be logged safely). */
export interface MonadAdapterConfig {
  rpcUrl: string;
  chainId: number;
  vaultAddress: Address;
  /** ProvenanceRegistry; only `anchorDataset` needs it (optional so settlement runs without it). */
  registryAddress?: Address;
  /** First block to scan for Vault logs (deploy block). */
  vaultDeployBlock: bigint;
  /** Max wait for a receipt (and for another instance's in-flight tx) per call. */
  txTimeoutMs: number;
  /** Blocks on top of the receipt block, the receipt block included. Monad has ~1-slot speculative finality. */
  confirmations: number;
  pollIntervalMs: number;
  /** How long one instance may hold a job before it has recorded a tx. */
  leaseMs: number;
  /** A tx the node no longer knows is re-broadcast (same raw tx, same nonce) once after this delay. */
  dropGraceMs: number;
  /** eth_getLogs block range per request (public RPCs cap it). */
  logChunkSize: bigint;
}

export const DEFAULTS = {
  chainId: 10143,
  txTimeoutMs: 60_000,
  confirmations: 1,
  pollIntervalMs: 500,
  leaseMs: 30_000,
  dropGraceMs: 10_000,
  logChunkSize: 1_000,
} as const;

export class MonadConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonadConfigError";
  }
}

type Env = Record<string, string | undefined>;

function positiveInt(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) throw new MonadConfigError(`${name} must be a positive integer.`);
  return n;
}

/**
 * Reads the adapter config. Server-only variables:
 *   MONAD_RPC_URL (fallback NEXT_PUBLIC_MONAD_RPC_URL), MONAD_CHAIN_ID (fallback NEXT_PUBLIC_MONAD_CHAIN_ID, 10143),
 *   MONAD_VAULT_ADDRESS (required), MONAD_REGISTRY_ADDRESS (optional), MONAD_VAULT_DEPLOY_BLOCK (0), MONAD_TX_TIMEOUT_MS (60000),
 *   MONAD_TX_CONFIRMATIONS (1), MONAD_POLL_INTERVAL_MS (500), MONAD_LEASE_MS (30000),
 *   MONAD_DROP_GRACE_MS (10000), MONAD_LOG_CHUNK_BLOCKS (1000).
 */
export function loadConfigFromEnv(env: Env = process.env): MonadAdapterConfig {
  const rpcUrl = env.MONAD_RPC_URL || env.NEXT_PUBLIC_MONAD_RPC_URL;
  if (!rpcUrl || !/^https?:\/\//.test(rpcUrl)) throw new MonadConfigError("MONAD_RPC_URL must be an http(s) URL.");
  const vault = env.MONAD_VAULT_ADDRESS;
  if (!vault || !isAddress(vault, { strict: false })) {
    throw new MonadConfigError("MONAD_VAULT_ADDRESS must be the MissionVault address.");
  }
  const registry = env.MONAD_REGISTRY_ADDRESS;
  if (registry && !isAddress(registry, { strict: false })) {
    throw new MonadConfigError("MONAD_REGISTRY_ADDRESS must be the ProvenanceRegistry address.");
  }
  const deployBlock = env.MONAD_VAULT_DEPLOY_BLOCK || "0";
  if (!/^[0-9]+$/.test(deployBlock)) throw new MonadConfigError("MONAD_VAULT_DEPLOY_BLOCK must be a block number.");

  const chainIdVar = env.MONAD_CHAIN_ID ? "MONAD_CHAIN_ID" : "NEXT_PUBLIC_MONAD_CHAIN_ID";
  return {
    rpcUrl,
    chainId: positiveInt(env, chainIdVar, DEFAULTS.chainId),
    vaultAddress: getAddress(vault),
    ...(registry ? { registryAddress: getAddress(registry) } : {}),
    vaultDeployBlock: BigInt(deployBlock),
    txTimeoutMs: positiveInt(env, "MONAD_TX_TIMEOUT_MS", DEFAULTS.txTimeoutMs),
    confirmations: positiveInt(env, "MONAD_TX_CONFIRMATIONS", DEFAULTS.confirmations),
    pollIntervalMs: positiveInt(env, "MONAD_POLL_INTERVAL_MS", DEFAULTS.pollIntervalMs),
    leaseMs: positiveInt(env, "MONAD_LEASE_MS", DEFAULTS.leaseMs),
    dropGraceMs: positiveInt(env, "MONAD_DROP_GRACE_MS", DEFAULTS.dropGraceMs),
    logChunkSize: BigInt(positiveInt(env, "MONAD_LOG_CHUNK_BLOCKS", DEFAULTS.logChunkSize)),
  };
}

/** MONAD_VERIFIER_PRIVATE_KEY — server env only. The value never appears in an error, a log or a return value. */
export function readVerifierKey(env: Env = process.env): Hex {
  const key = env.MONAD_VERIFIER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new MonadConfigError("MONAD_VERIFIER_PRIVATE_KEY must be set to a 0x-prefixed 32-byte hex key.");
  }
  return key as Hex;
}
