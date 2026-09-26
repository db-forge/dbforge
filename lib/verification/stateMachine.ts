// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Pure submission state-machine rules for M2, centralized here so the
// route handler doesn't scatter status logic inline.
//
//   uploaded   -> verifying   (enter verification)
//   verifying  -> verifying   (safe retry / rerun deterministic checks)
//   accepted/rejected/paid are final: never re-entered by M2.

import { DeterministicVerificationRequiredError, SubmissionFinalizedError } from "@/lib/supabase/errors";
import type { SubmissionStatus } from "@/lib/supabase/types";
import { FINAL_SUBMISSION_STATUSES } from "./types";

export type VerificationEntryAction = "transition_to_verifying" | "rerun_verifying";

/**
 * Decides what the verify endpoint should do given a submission's current
 * status. Throws SubmissionFinalizedError for any final state — the route
 * lets this propagate and app/api/_lib/errors.ts maps it to HTTP 409
 * SUBMISSION_FINALIZED.
 *
 * Note: this function (M2) does not have a case for "manual_review" (an
 * M3 status) — a manual_review submission falls into the "rerun_verifying"
 * branch below since it's neither final nor "uploaded". That's a narrow,
 * intentionally out-of-scope edge case: nothing in the normal flow calls
 * the M2 deterministic endpoint again once M3 has taken over a submission.
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

/**
 * Decides whether the M3 AI verification endpoint may run. Eligible entry
 * states are "verifying" (first AI pass, or a retry after a transient
 * provider failure) and "manual_review" (an explicit re-run of AI
 * verification — never silently promoted to accepted without actually
 * re-running the pipeline). Requires the M2 deterministic pass to have
 * recorded technical_valid=true; otherwise this isn't a "finalized"
 * conflict, it's a sequencing error, so it gets its own typed error.
 */
export function decideAiVerificationEntry(
  status: SubmissionStatus,
  deterministicPassed: boolean,
): "run_ai_verification" {
  if (FINAL_SUBMISSION_STATUSES.includes(status)) {
    throw new SubmissionFinalizedError(
      `Submission is already finalized (status: ${status}) and cannot be AI-verified.`,
    );
  }
  if (status !== "verifying" && status !== "manual_review") {
    throw new DeterministicVerificationRequiredError(
      `Submission must be in 'verifying' or 'manual_review' status for AI verification; current status is '${status}'.`,
    );
  }
  if (!deterministicPassed) {
    throw new DeterministicVerificationRequiredError(
      "Submission has not passed M2 deterministic verification (technical_valid=true) yet.",
    );
  }
  return "run_ai_verification";
}
