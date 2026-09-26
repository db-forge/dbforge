// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Read-side chain gateway boundary for settlement reconciliation. Same
// pattern as lib/verification/settlement/gateway.ts — lib/monad does not
// exist yet, so nothing here imports it; wire in the real adapter later
// with a plain static import:
//
//   import { getSubmissionSettlementStatus } from "@/lib/monad/settlement";
//   export function getSettlementStatusGateway(): SettlementStatusGateway {
//     return { getSubmissionSettlementStatus };
//   }

export interface SettlementStatusGatewayInput {
  chainMissionId: string;
  mediaHashHex: string;
}

export interface SettlementStatusGatewayResult {
  settled: boolean;
  creditedAmountWei?: string;
  txHash?: string;
}

export type SettlementStatusGatewayErrorKind = "unavailable" | "timeout" | "unknown";

export class SettlementStatusGatewayError extends Error {
  constructor(
    message: string,
    readonly kind: SettlementStatusGatewayErrorKind,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SettlementStatusGatewayError";
  }
}

export interface SettlementStatusGateway {
  getSubmissionSettlementStatus(
    input: SettlementStatusGatewayInput,
  ): Promise<SettlementStatusGatewayResult>;
}

let testOverride: SettlementStatusGateway | null = null;

/** Test-only injection point — see gateway.ts's identical pattern/caveats. */
export function __setSettlementStatusGatewayForTests(
  gateway: SettlementStatusGateway | null,
): void {
  testOverride = gateway;
}

export function getSettlementStatusGateway(): SettlementStatusGateway {
  if (testOverride) return testOverride;

  throw new SettlementStatusGatewayError(
    "No settlement status gateway is configured yet — the Monad read adapter has not been wired in.",
    "unavailable",
  );
}
