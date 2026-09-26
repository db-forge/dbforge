// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Settlement gateway factory — the seam where Developer 2's real Monad
// adapter gets plugged in. lib/monad/ does not exist yet and is not this
// milestone's to create, so nothing here imports it.
//
// Once it exists, wire it in with a plain static import, e.g.:
//
//   import { settleSubmission } from "@/lib/monad/settlement";
//
//   export function getSettlementGateway(): SettlementGateway {
//     return { settleSubmission };
//   }
//
// Expected adapter contract (owned by Developer 2):
//   settleSubmission({ chainMissionId, contributorAddress, submissionHash })
//     -> Promise<{ txHash, amountWei, blockNumber }>
// See lib/verification/settlement/types.ts for the exact types.
//
// Until the real adapter is wired in, this always throws a typed
// "unavailable" error — the settlement endpoint turns that into
// 503 SETTLEMENT_GATEWAY_UNAVAILABLE. No fake production implementation,
// no invented tx hashes.

import { SettlementGatewayError } from "./types";
import type { SettlementGateway } from "./types";

let testOverride: SettlementGateway | null = null;

/**
 * Test-only injection point. There is no environment variable or request
 * input that reaches this — the only way a non-throwing gateway is ever
 * returned is a test explicitly importing and calling this function
 * before hitting the route, which cannot happen from an incoming HTTP
 * request. Always call with `null` afterward to restore real behavior.
 */
export function __setSettlementGatewayForTests(gateway: SettlementGateway | null): void {
  testOverride = gateway;
}

export function getSettlementGateway(): SettlementGateway {
  if (testOverride) return testOverride;

  throw new SettlementGatewayError(
    "No settlement gateway is configured yet — the Monad adapter (lib/monad) has not been wired in.",
    "unavailable",
  );
}
