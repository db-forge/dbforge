// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// The settlement gateway boundary. This is the exact conceptual interface
// the blockchain developer's Monad adapter is being built against
// independently — nothing here imports from lib/monad (it doesn't exist
// yet, and isn't this milestone's to create).

export interface SettlementGatewayInput {
  chainMissionId: string;
  contributorAddress: string;
  submissionHash: string;
}

export interface SettlementGatewayResult {
  // null only when the chain shows the settlement but its Settled log is
  // outside the scanned block range (real lib/monad SettleSubmissionResult
  // shape — no separate blockNumber is available from this call).
  txHash: string | null;
  amountWei: string;
}

export type SettlementGatewayErrorKind = "unavailable" | "rejected" | "timeout" | "unknown";

export class SettlementGatewayError extends Error {
  constructor(
    message: string,
    readonly kind: SettlementGatewayErrorKind,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SettlementGatewayError";
  }
}

export interface SettlementGateway {
  settleSubmission(input: SettlementGatewayInput): Promise<SettlementGatewayResult>;
}
