// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Read-side chain gateway for settlement reconciliation — wired to the
// real lib/monad SettlementAdapter.getSettlement (confirmed shape from
// origin/feat/contracts's lib/monad/adapter.ts at integration time).

import { isMonadSettlementError, type MonadErrorCode } from "@/lib/monad";
import { getMonadSettlementAdapter } from "../monadAdapter";

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

function mapErrorKind(code: MonadErrorCode): SettlementStatusGatewayErrorKind {
  return code === "RPC_ERROR" ? "unavailable" : "unknown";
}

const realGateway: SettlementStatusGateway = {
  async getSubmissionSettlementStatus(input) {
    try {
      const view = await getMonadSettlementAdapter().getSettlement({
        chainMissionId: input.chainMissionId,
        // mediaHashHex is stored as bare 64 hex (no 0x prefix, see M1).
        submissionHash: `0x${input.mediaHashHex}`,
      });

      if (view.status === "settled") {
        return { settled: true, creditedAmountWei: view.amount, ...(view.txHash ? { txHash: view.txHash } : {}) };
      }
      return { settled: false, ...(view.status === "pending" && view.txHash ? { txHash: view.txHash } : {}) };
    } catch (error) {
      if (isMonadSettlementError(error)) {
        throw new SettlementStatusGatewayError(error.message, mapErrorKind(error.code), error);
      }
      throw new SettlementStatusGatewayError(
        "Unexpected error reading settlement status from the chain.",
        "unknown",
        error,
      );
    }
  },
};

export function getSettlementStatusGateway(): SettlementStatusGateway {
  return testOverride ?? realGateway;
}
