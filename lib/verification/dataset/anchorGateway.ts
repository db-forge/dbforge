// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Dataset anchor gateway — wired to the real lib/monad
// SettlementAdapter.anchorDataset (confirmed shape from
// origin/feat/contracts's lib/monad/adapter.ts at integration time). Note
// the real input field is `manifestHash`, not `metadataHash` — mapped here
// so the rest of this codebase can keep its own naming.
//
// Per lib/monad/README.md's "Dataset anchor flow": the buyer calls
// ProvenanceRegistry.finalizeDataset from their OWN wallet after reviewing
// the root — this backend never calls finalizeDataset, only anchorDataset
// (which is idempotent: the same root/count/hash already on chain succeeds
// with no new tx).

import { isMonadSettlementError, type MonadErrorCode } from "@/lib/monad";
import { getMonadSettlementAdapter } from "../monadAdapter";

export interface DatasetAnchorGatewayInput {
  chainMissionId: string;
  merkleRoot: string;
  sampleCount: number;
  metadataHash: string;
}

export interface DatasetAnchorGatewayResult {
  // null only when the chain already holds this anchor but its
  // DatasetAnchored log is outside the scanned block range.
  txHash: string | null;
}

export type DatasetAnchorGatewayErrorKind = "unavailable" | "rejected" | "timeout" | "unknown";

export class DatasetAnchorGatewayError extends Error {
  constructor(
    message: string,
    readonly kind: DatasetAnchorGatewayErrorKind,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DatasetAnchorGatewayError";
  }
}

export interface DatasetAnchorGateway {
  anchorDataset(input: DatasetAnchorGatewayInput): Promise<DatasetAnchorGatewayResult>;
}

let testOverride: DatasetAnchorGateway | null = null;

/** Test-only injection point — see settlement/gateway.ts's identical pattern/caveats. */
export function __setDatasetAnchorGatewayForTests(gateway: DatasetAnchorGateway | null): void {
  testOverride = gateway;
}

function mapErrorKind(code: MonadErrorCode): DatasetAnchorGatewayErrorKind {
  switch (code) {
    case "TX_TIMEOUT":
      return "timeout";
    case "RPC_ERROR":
      return "unavailable";
    default:
      return "rejected";
  }
}

const realGateway: DatasetAnchorGateway = {
  async anchorDataset(input) {
    try {
      const result = await getMonadSettlementAdapter().anchorDataset({
        chainMissionId: input.chainMissionId,
        merkleRoot: input.merkleRoot,
        sampleCount: input.sampleCount,
        manifestHash: input.metadataHash,
      });
      return { txHash: result.txHash };
    } catch (error) {
      if (isMonadSettlementError(error)) {
        throw new DatasetAnchorGatewayError(error.message, mapErrorKind(error.code), error);
      }
      throw new DatasetAnchorGatewayError(
        "Unexpected error calling the dataset anchor adapter.",
        "unknown",
        error,
      );
    }
  },
};

export function getDatasetAnchorGateway(): DatasetAnchorGateway {
  return testOverride ?? realGateway;
}
