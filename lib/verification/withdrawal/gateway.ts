// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Contributor withdrawal gateway — wired to the real lib/monad
// SettlementAdapter.getContributorBalance / withdrawForContributor
// (confirmed shape from origin/feat/contracts's lib/monad/adapter.ts at
// integration time). withdrawForContributor takes ONLY contributorAddress
// — there is no recipient parameter anywhere in this boundary or the real
// adapter, by design: funds must always go to the contributor, never a
// caller-chosen address.

import { isMonadSettlementError, type MonadErrorCode } from "@/lib/monad";
import { getMonadSettlementAdapter } from "../monadAdapter";

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

function mapErrorKind(code: MonadErrorCode): WithdrawalGatewayErrorKind {
  switch (code) {
    case "TX_TIMEOUT":
      return "timeout";
    case "RPC_ERROR":
      return "unavailable";
    default:
      return "rejected";
  }
}

function wrap(error: unknown, action: string): WithdrawalGatewayError {
  if (isMonadSettlementError(error)) {
    return new WithdrawalGatewayError(error.message, mapErrorKind(error.code), error);
  }
  return new WithdrawalGatewayError(`Unexpected error during ${action}.`, "unknown", error);
}

const realGateway: WithdrawalGateway = {
  async getContributorBalance(input) {
    try {
      const balance = await getMonadSettlementAdapter().getContributorBalance(input);
      return { withdrawableWei: balance.withdrawable };
    } catch (error) {
      throw wrap(error, "balance check");
    }
  },

  async withdrawForContributor(input) {
    try {
      const result = await getMonadSettlementAdapter().withdrawForContributor(input);
      return { txHash: result.txHash };
    } catch (error) {
      throw wrap(error, "withdrawal");
    }
  },
};

export function getWithdrawalGateway(): WithdrawalGateway {
  return testOverride ?? realGateway;
}
