// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Atomic, race-safe submission acceptance. Wraps the public.accept_submission
// Postgres function (migration 0006), which in a single transaction with
// row locks: checks the submission is still in an eligible state, checks
// the mission is active with remaining capacity, then increments
// missions.accepted_count and marks the submission accepted. This is the
// only sanctioned way to move a submission to "accepted" — never a
// read-then-write increment from application code.

import { getSupabaseServiceClient } from "./client";
import type { SubmissionRow, SubmissionStatus } from "./types";

export type AcceptSubmissionConflictReason =
  | "SUBMISSION_NOT_FOUND"
  | "SUBMISSION_NOT_ELIGIBLE"
  | "MISSION_NOT_FOUND"
  | "MISSION_NOT_ACTIVE"
  | "MISSION_TARGET_REACHED";

export type AcceptSubmissionResult =
  | { ok: true; submission: SubmissionRow }
  | { ok: false; reason: AcceptSubmissionConflictReason };

const KNOWN_REASONS: readonly AcceptSubmissionConflictReason[] = [
  "SUBMISSION_NOT_FOUND",
  "SUBMISSION_NOT_ELIGIBLE",
  "MISSION_NOT_FOUND",
  "MISSION_NOT_ACTIVE",
  "MISSION_TARGET_REACHED",
];

export async function acceptSubmissionAtomically(
  submissionId: string,
  expectedStatuses: readonly SubmissionStatus[],
): Promise<AcceptSubmissionResult> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("accept_submission", {
    p_submission_id: submissionId,
    p_expected_statuses: expectedStatuses,
  });

  if (error) {
    const reason = KNOWN_REASONS.find((r) => error.message.includes(r));
    if (reason) {
      return { ok: false, reason };
    }
    throw new Error(`Failed to accept submission ${submissionId}: ${error.message}`);
  }

  return { ok: true, submission: data as SubmissionRow };
}
