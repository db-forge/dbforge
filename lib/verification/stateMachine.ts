// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Pure submission state-machine rules for M2, centralized here so the
// route handler doesn't scatter status logic inline.
//
//   uploaded   -> verifying   (enter verification)
//   verifying  -> verifying   (safe retry / rerun deterministic checks)
//   accepted/rejected/paid are final: never re-entered by M2.

import { SubmissionFinalizedError } from "@/lib/supabase/errors";
import type { SubmissionStatus } from "@/lib/supabase/types";
import { FINAL_SUBMISSION_STATUSES } from "./types";

export type VerificationEntryAction = "transition_to_verifying" | "rerun_verifying";

/**
 * Decides what the verify endpoint should do given a submission's current
 * status. Throws SubmissionFinalizedError for any final state — the route
 * lets this propagate and app/api/_lib/errors.ts maps it to HTTP 409
 * SUBMISSION_FINALIZED.
 */
export function decideVerificationEntry(status: SubmissionStatus): VerificationEntryAction {
  if (FINAL_SUBMISSION_STATUSES.includes(status)) {
    throw new SubmissionFinalizedError(
      `Submission is already finalized (status: ${status}) and cannot be re-verified.`,
    );
  }
  if (status === "uploaded") return "transition_to_verifying";
  return "rerun_verifying"; // status === "verifying"
}
