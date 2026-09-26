// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Settlement gateway — wired to the real lib/monad SettlementAdapter
// (confirmed shape from origin/feat/contracts's lib/monad/adapter.ts at
// integration time, not assumed). `settleSubmission` blocks until a
// successful receipt (or throws); ALREADY_SETTLED is not an error on the
// adapter's side — the same (chainMissionId, submissionHash) just returns
// the first result again, which is exactly the idempotency this module's
// caller (app/api/settlement/[submissionId]/route.ts) needs.

import { isMonadSettlementError, type MonadErrorCode } from "@/lib/monad";
import { getMonadSettlementAdapter } from "../monadAdapter";
import { SettlementGatewayError } from "./types";
import type { SettlementGateway, SettlementGatewayErrorKind } from "./types";

let testOverride: SettlementGateway | null = null;

/**
 * Test-only injection point. There is no environment variable or request
 * input that reaches this — the only way a non-default gateway is ever
 * returned is a test explicitly importing and calling this function
 * before hitting the route, which cannot happen from an incoming HTTP
 * request. Always call with `null` afterward to restore real behavior.
 */
export function __setSettlementGatewayForTests(gateway: SettlementGateway | null): void {
  testOverride = gateway;
}

function mapErrorKind(code: MonadErrorCode): SettlementGatewayErrorKind {
  switch (code) {
    case "TX_TIMEOUT":
      return "timeout";
    case "RPC_ERROR":
      return "unavailable";
    default:
      // INVALID_INPUT, MISSION_NOT_FOUND, CONTRACT_PAUSED, INSUFFICIENT_FUNDS, TX_REVERTED
      return "rejected";
  }
}

const realGateway: SettlementGateway = {
  async settleSubmission(input) {
    try {
      const result = await getMonadSettlementAdapter().settleSubmission(input);
      return { txHash: result.txHash, amountWei: result.amount };
    } catch (error) {
      if (isMonadSettlementError(error)) {
        throw new SettlementGatewayError(error.message, mapErrorKind(error.code), error);
      }
      throw new SettlementGatewayError(
        "Unexpected error calling the settlement adapter.",
        "unknown",
        error,
      );
    }
  },
};

export function getSettlementGateway(): SettlementGateway {
  return testOverride ?? realGateway;
}
