// Browser-side config: chain id + the three contract addresses. Nothing secret lives here (NEXT_PUBLIC_ only).

import { getAddress, isAddress, type Address } from "viem";
import { DbforgeClientError } from "./errors";

export interface DbforgeClientConfig {
  chainId: number;
  factory: Address;
  vault: Address;
  registry: Address;
  /** First block of the deployment; lower bound for log scans. */
  deployBlock: bigint;
}

/** Mirror of contracts/deployments/monad-testnet.json (test/config.test.ts keeps them equal). */
export const MONAD_TESTNET_DEPLOYMENT: DbforgeClientConfig = {
  chainId: 10143,
  factory: "0xC462FbC4ae4D522C19714c9DeE4D6f4Ff03c4c73",
  vault: "0xcc10787653F33fefA68a455bEe3daB964C22e0b3",
  registry: "0x4e9D5E72c00e30be7A0431B6b69BF296362E99Ec",
  deployBlock: BigInt(65855492),
};

export interface PublicEnv {
  NEXT_PUBLIC_MONAD_CHAIN_ID?: string;
  NEXT_PUBLIC_MISSION_FACTORY_ADDRESS?: string;
  NEXT_PUBLIC_MISSION_VAULT_ADDRESS?: string;
  NEXT_PUBLIC_PROVENANCE_REGISTRY_ADDRESS?: string;
  NEXT_PUBLIC_MONAD_DEPLOY_BLOCK?: string;
}

/** Next.js inlines NEXT_PUBLIC_ vars only on literal `process.env.X` reads, so each one is spelled out. */
export function readPublicEnv(): PublicEnv {
  return {
    NEXT_PUBLIC_MONAD_CHAIN_ID: process.env.NEXT_PUBLIC_MONAD_CHAIN_ID,
    NEXT_PUBLIC_MISSION_FACTORY_ADDRESS: process.env.NEXT_PUBLIC_MISSION_FACTORY_ADDRESS,
    NEXT_PUBLIC_MISSION_VAULT_ADDRESS: process.env.NEXT_PUBLIC_MISSION_VAULT_ADDRESS,
    NEXT_PUBLIC_PROVENANCE_REGISTRY_ADDRESS: process.env.NEXT_PUBLIC_PROVENANCE_REGISTRY_ADDRESS,
    NEXT_PUBLIC_MONAD_DEPLOY_BLOCK: process.env.NEXT_PUBLIC_MONAD_DEPLOY_BLOCK,
  };
}

function addressOr(value: string | undefined, fallback: Address | undefined, name: string): Address {
  if (!value) {
    if (fallback) return fallback;
    throw new DbforgeClientError("CONFIG_MISSING", { reason: name });
  }
  if (!isAddress(value, { strict: false })) throw new DbforgeClientError("CONFIG_MISSING", { reason: name });
  return getAddress(value);
}

/**
 * Env wins; on chain 10143 any missing address falls back to the deployed testnet contracts.
 * On any other chain (anvil, a new deploy) all three addresses are required.
 */
export function loadClientConfig(env: PublicEnv = readPublicEnv()): DbforgeClientConfig {
  const chainId = env.NEXT_PUBLIC_MONAD_CHAIN_ID ? Number(env.NEXT_PUBLIC_MONAD_CHAIN_ID) : 10143;
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new DbforgeClientError("CONFIG_MISSING", { reason: "NEXT_PUBLIC_MONAD_CHAIN_ID" });
  }
  const d = chainId === MONAD_TESTNET_DEPLOYMENT.chainId ? MONAD_TESTNET_DEPLOYMENT : undefined;
  const block = env.NEXT_PUBLIC_MONAD_DEPLOY_BLOCK;
  if (block !== undefined && block !== "" && !/^\d+$/.test(block)) {
    throw new DbforgeClientError("CONFIG_MISSING", { reason: "NEXT_PUBLIC_MONAD_DEPLOY_BLOCK" });
  }
  return {
    chainId,
    factory: addressOr(env.NEXT_PUBLIC_MISSION_FACTORY_ADDRESS, d?.factory, "NEXT_PUBLIC_MISSION_FACTORY_ADDRESS"),
    vault: addressOr(env.NEXT_PUBLIC_MISSION_VAULT_ADDRESS, d?.vault, "NEXT_PUBLIC_MISSION_VAULT_ADDRESS"),
    registry: addressOr(env.NEXT_PUBLIC_PROVENANCE_REGISTRY_ADDRESS, d?.registry, "NEXT_PUBLIC_PROVENANCE_REGISTRY_ADDRESS"),
    deployBlock: block ? BigInt(block) : (d?.deployBlock ?? BigInt(0)),
  };
}
