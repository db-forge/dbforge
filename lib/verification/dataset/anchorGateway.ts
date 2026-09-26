// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Dataset anchor gateway boundary (M5 Part L). Same pattern as
// lib/verification/settlement/gateway.ts — lib/monad doesn't exist yet,
// so nothing here imports it. Wire in the real adapter later:
//
//   import { anchorDataset } from "@/lib/monad/dataset";
//   export function getDatasetAnchorGateway(): DatasetAnchorGateway {
//     return { anchorDataset };
//   }
//
// Until then this always throws a typed "unavailable" error — the anchor
// endpoint turns that into 503 DATASET_ANCHOR_GATEWAY_UNAVAILABLE. No fake
// production implementation, no invented tx hashes.

export interface DatasetAnchorGatewayInput {
  chainMissionId: string;
  merkleRoot: string;
  sampleCount: number;
  metadataHash: string;
}

export interface DatasetAnchorGatewayResult {
  txHash: string;
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

export function getDatasetAnchorGateway(): DatasetAnchorGateway {
  if (testOverride) return testOverride;

  throw new DatasetAnchorGatewayError(
    "No dataset anchor gateway is configured yet — the Monad adapter (lib/monad) has not been wired in.",
    "unavailable",
  );
}
