// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Pure decision helpers for settlement reconciliation. No I/O — the route
// fetches rows, calls these, then decides which lib/supabase write to make.

import type { SettlementRow, SubmissionRow } from "@/lib/supabase/types";

// How long a settlement is allowed to sit in "broadcasting" before a
// chain-says-not-settled response is trusted enough to demote it to
// "failed" (retryable). Guards against reconciling too eagerly while a
// legitimately in-flight broadcast just hasn't confirmed on-chain yet.
export const RECONCILIATION_GRACE_PERIOD_MS = 60_000;

export type ReconciliationEntry =
  | { kind: "not_required" }
  | { kind: "already_consistent" }
  | { kind: "reconcile" };

/**
 * Decides what a reconcile call should do given the current settlement +
 * submission rows:
 *  - no settlement row, or settlement never even attempted ('pending'):
 *    nothing to check against the chain -> not_required.
 *  - settlement confirmed AND submission paid (fully consistent, whether
 *    naturally or from a prior reconciliation): idempotent success,
 *    nothing to mutate -> already_consistent.
 *  - anything else (broadcasting, failed, or confirmed-but-submission-
 *    not-paid) -> reconcile.
 */
export function decideReconciliationEntry(
  settlement: SettlementRow | null,
  submission: SubmissionRow,
): ReconciliationEntry {
  if (!settlement || settlement.status === "pending") {
    return { kind: "not_required" };
  }
  if (settlement.status === "confirmed" && submission.status === "paid") {
    return { kind: "already_consistent" };
  }
  return { kind: "reconcile" };
}

export function hasReconciliationGracePeriodElapsed(settlement: SettlementRow, now: Date): boolean {
  return now.getTime() - new Date(settlement.updated_at).getTime() >= RECONCILIATION_GRACE_PERIOD_MS;
}
