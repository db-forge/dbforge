// lib/monad — server-side entry point. Import only from route handlers / server code:
//   import { createMonadSettlement, createSupabaseSettlementStore } from "@/lib/monad";
// `server-only` makes a client-component import fail at build time (Next.js aliases the package itself).
import "server-only";

import { SettlementAdapter } from "./adapter";
import { createViemVaultChain } from "./chain";
import { loadConfigFromEnv, readVerifierKey } from "./config";
import { jsonConsoleLogger, type SettlementLogger } from "./log";
import type { SettlementStore } from "./store/types";

export { SettlementAdapter } from "./adapter";
export type {
  AnchorDatasetInput,
  AnchorDatasetResult,
  ContributorBalance,
  SettleSubmissionInput,
  SettleSubmissionResult,
  SettlementView,
  WithdrawResult,
  WithdrawalEntry,
} from "./adapter";
export { MonadSettlementError, isMonadSettlementError, type MonadErrorCode } from "./errors";
export { MonadConfigError } from "./config";
export { createSupabaseSettlementStore, SupabaseSettlementStore } from "./store/supabase";
export { MemorySettlementStore } from "./store/memory";
export type { SettlementStore } from "./store/types";
export type { SettlementLogEvent, SettlementLogger } from "./log";

// G6c read helpers (no key): dataset tree from the chain's Settled events, mission-create check, dataset reads.
// Each takes an optional MonadReader; the default is built from env (MONAD_FACTORY_ADDRESS, MONAD_REGISTRY_ADDRESS).
export {
  buildDatasetTree,
  buildTreeFromHashes,
  datasetLeaf,
  type DatasetTree,
  type OnChainDatasetTree,
  type SettledEntry,
} from "./merkle";
export { canonicalJson, metadataHash, readMissionCreated, type MissionCreatedView } from "./mission";
export { getDataset, getSampleProof, type DatasetView, type SampleProof } from "./dataset";
export { createMonadReader, type MonadReader } from "./reader";

/**
 * Builds the adapter from server env (see README). One adapter per process is enough; several processes may
 * run at once — idempotency and nonces are coordinated through `store`.
 */
export function createMonadSettlement(options: {
  store: SettlementStore;
  logger?: SettlementLogger;
  env?: Record<string, string | undefined>;
}): SettlementAdapter {
  const env = options.env ?? process.env;
  const config = loadConfigFromEnv(env);
  const chain = createViemVaultChain(config, readVerifierKey(env));
  return new SettlementAdapter({
    chain,
    store: options.store,
    timings: config,
    logger: options.logger ?? jsonConsoleLogger,
  });
}
