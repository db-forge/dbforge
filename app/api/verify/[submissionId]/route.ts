// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// POST /api/verify/[submissionId] — runs the M2 deterministic verification
// pipeline. A deterministic rejection is a successful execution (HTTP 200);
// only genuine infrastructure failures (storage/DB errors) are 5xx.

import { NextResponse } from "next/server";
import { ApiError, withApiErrorHandling } from "@/app/api/_lib/errors";
import { assertUuid } from "@/app/api/_lib/validation";
import { toVerifyResponseDto } from "@/app/api/_lib/dto";
import { getMissionById } from "@/lib/supabase/missions";
import {
  findOtherSubmissionsWithSameHash,
  getSubmissionById,
  markSubmissionRejected,
  markSubmissionVerifying,
} from "@/lib/supabase/submissions";
import { submissionMediaObjectExists } from "@/lib/supabase/storage";
import { upsertVerificationResult } from "@/lib/supabase/verification";
import { decideVerificationEntry } from "@/lib/verification/stateMachine";
import { runVerificationPipeline } from "@/lib/verification/pipeline";
import type { SubmissionRow } from "@/lib/supabase/types";

interface RouteParams {
  params: Promise<{ submissionId: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  return withApiErrorHandling(async () => {
    const { submissionId } = await params;
    assertUuid(submissionId, "submissionId");

    const submission = await getSubmissionById(submissionId);
    if (!submission) {
      throw ApiError.submissionNotFound(`Submission ${submissionId} not found.`);
    }

    // Throws SubmissionFinalizedError (-> 409) for accepted/rejected/paid.
    const action = decideVerificationEntry(submission.status);

    let currentSubmission: SubmissionRow = submission;

    if (action === "transition_to_verifying") {
      const updated = await markSubmissionVerifying(submissionId);
      if (updated) {
        currentSubmission = updated;
      } else {
        // Lost a race to another concurrent verify request — re-fetch and
        // re-decide rather than assume anything about the new state.
        const refreshed = await getSubmissionById(submissionId);
        if (!refreshed) {
          throw ApiError.submissionNotFound(`Submission ${submissionId} not found.`);
        }
        decideVerificationEntry(refreshed.status);
        currentSubmission = refreshed;
      }
    }

    const mission = await getMissionById(currentSubmission.mission_id);

    const storageObjectExists = currentSubmission.media_path
      ? await submissionMediaObjectExists(currentSubmission.media_path).catch((error) => {
          console.error("Storage existence check failed:", error);
          throw ApiError.verificationFailed("Failed to verify media storage existence.");
        })
      : false;

    const otherSubmissionsWithSameHash = currentSubmission.media_hash
      ? await findOtherSubmissionsWithSameHash(
          currentSubmission.mission_id,
          currentSubmission.media_hash,
          currentSubmission.id,
        )
      : [];

    const outcome = runVerificationPipeline({
      submission: currentSubmission,
      mission,
      storageObjectExists,
      otherSubmissionsWithSameHash,
      now: new Date(),
    });

    await upsertVerificationResult({
      submissionId: currentSubmission.id,
      technicalValid: outcome.technicalValid,
      technicalScore: outcome.technicalScore,
      duplicateDetected: outcome.duplicateDetected,
      checks: outcome.checks,
      startedAt: outcome.startedAt,
      completedAt: outcome.completedAt,
      verificationVersion: outcome.verificationVersion,
      failureCode: outcome.failureCode,
      finalDecision: outcome.technicalValid ? "pending" : "rejected",
    }).catch((error) => {
      console.error("Failed to persist verification result:", error);
      throw ApiError.databaseError("Failed to persist verification result.");
    });

    if (!outcome.technicalValid) {
      const rejected = await markSubmissionRejected(currentSubmission.id);
      currentSubmission = rejected ?? (await getSubmissionById(currentSubmission.id)) ?? currentSubmission;
    }

    return NextResponse.json(toVerifyResponseDto(currentSubmission, outcome), { status: 200 });
  });
}
