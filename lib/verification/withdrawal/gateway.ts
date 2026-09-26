// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Contributor withdrawal gateway boundary. Same pattern as
// lib/verification/settlement/gateway.ts — lib/monad doesn't exist yet, so
// nothing here imports it. Wire in the real adapter later:
//
//   import { getContributorBalance, withdrawForContributor } from "@/lib/monad/withdrawal";
//   export function getWithdrawalGateway(): WithdrawalGateway {
//     return { getContributorBalance, withdrawForContributor };
//   }
//
// withdrawForContributor takes ONLY contributorAddress — there is no
// recipient parameter anywhere in this boundary, by design: funds must
// always go to the contributor, never a caller-chosen address.

export interface ContributorBalanceResult {
  withdrawableWei: string;
}

export interface WithdrawResult {
  txHash: string;
}

export type WithdrawalGatewayErrorKind = "unavailable" | "rejected" | "timeout" | "unknown";

export class WithdrawalGatewayError extends Error {
  constructor(
    message: string,
    readonly kind: WithdrawalGatewayErrorKind,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "WithdrawalGatewayError";
  }
}

export interface WithdrawalGateway {
  getContributorBalance(input: { contributorAddress: string }): Promise<ContributorBalanceResult>;
  withdrawForContributor(input: { contributorAddress: string }): Promise<WithdrawResult>;
}

let testOverride: WithdrawalGateway | null = null;

/** Test-only injection point — see settlement/gateway.ts's identical pattern/caveats. */
export function __setWithdrawalGatewayForTests(gateway: WithdrawalGateway | null): void {
  testOverride = gateway;
}

export function getWithdrawalGateway(): WithdrawalGateway {
  if (testOverride) return testOverride;

  throw new WithdrawalGatewayError(
    "No withdrawal gateway is configured yet — the Monad adapter (lib/monad) has not been wired in.",
    "unavailable",
  );
}
