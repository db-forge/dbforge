// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// POST /api/verify/[submissionId]/ai — M3 AI semantic verification. Runs
// after M2 deterministic verification has passed: builds mission criteria,
// fetches private media server-side, extracts frames for video, calls the
// vision provider, validates its structured output, and runs it through
// our own deterministic decision engine — the model never decides DB state
// directly. Provider/frame-extraction failures never accept a submission;
// they leave it in its current state so the call can be retried (see
// app/api/_lib/errors.ts's mapping of VisionProviderError / FfmpegUnavailableError).

import { NextResponse } from "next/server";
import { ApiError, withApiErrorHandling } from "@/app/api/_lib/errors";
import { assertUuid } from "@/app/api/_lib/validation";
import type { AiVerifyResponseDto } from "@/app/api/_lib/dto";
import { getMissionById } from "@/lib/supabase/missions";
import { getSubmissionById, markSubmissionAfterAi } from "@/lib/supabase/submissions";
import { acceptSubmissionAtomically } from "@/lib/supabase/acceptance";
import { downloadSubmissionMedia } from "@/lib/supabase/storage";
import {
  getVerificationResultBySubmissionId,
  recordAiVerificationResult,
  type UpsertAiVerificationResultInput,
} from "@/lib/supabase/verification";
import type { SubmissionRow } from "@/lib/supabase/types";
import { decideAiVerificationEntry } from "@/lib/verification/stateMachine";
import { buildMissionCriteria, CRITERIA_VERSION } from "@/lib/verification/criteria";
import { getMediaTypeConfig } from "@/lib/verification/media";
import { extractVideoFrames } from "@/lib/verification/video";
import { getVisionVerifier } from "@/lib/verification/ai/provider";
import type { VisionMediaFrame } from "@/lib/verification/ai/types";
import { decideSemanticOutcome, SEMANTIC_DECISION_VERSION, type SemanticDecision } from "@/lib/verification/decision";

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

    const deterministicResult = await getVerificationResultBySubmissionId(submissionId);
    // Throws SubmissionFinalizedError (-> 409) or DeterministicVerificationRequiredError (-> 409).
    decideAiVerificationEntry(submission.status, deterministicResult?.technical_valid === true);

    const mission = await getMissionById(submission.mission_id);
    if (!mission) {
      throw ApiError.missionNotFound(`Mission ${submission.mission_id} not found.`);
    }

    if (!submission.media_path || !submission.media_type) {
      throw ApiError.mediaNotFound(`Submission ${submissionId} has no associated media.`);
    }

    const criteria = buildMissionCriteria(mission);
    const mediaBytes = await downloadSubmissionMedia(submission.media_path);
    const mediaKind = getMediaTypeConfig(submission.media_type)?.kind ?? "image";

    let frames: VisionMediaFrame[];
    if (mediaKind === "video") {
      const extracted = await extractVideoFrames(mediaBytes);
      frames = extracted.map((f) => ({
        index: f.index,
        timestampMs: f.timestampMs,
        mimeType: f.mimeType,
        base64: f.base64,
      }));
    } else {
      frames = [
        {
          index: 0,
          timestampMs: 0,
          mimeType: submission.media_type,
          base64: mediaBytes.toString("base64"),
        },
      ];
    }

    const verifier = getVisionVerifier();

    const aiStartedAt = new Date().toISOString();
    const { result: aiResult, metadata } = await verifier.verify({
      missionTitle: mission.title,
      missionDescription: mission.description,
      criteria,
      frames,
    });
    const aiCompletedAt = new Date().toISOString();

    const { decision, semanticScore, reason } = decideSemanticOutcome(criteria, aiResult);

    const persist = (finalDecision: SemanticDecision, aiReason: string) => {
      const input: UpsertAiVerificationResultInput = {
        submissionId,
        aiProvider: metadata.provider,
        aiModel: metadata.model,
        aiResult,
        aiValid: aiResult.valid,
        aiConfidence: aiResult.overallConfidence,
        aiReason,
        semanticScore,
        criteriaVersion: CRITERIA_VERSION,
        aiStartedAt,
        aiCompletedAt,
        finalDecision,
      };
      return recordAiVerificationResult(input);
    };

    // Persist evidence before mutating submission status, so the audit
    // trail survives even if the status transition below hits a conflict.
    await persist(decision, reason);

    let finalDecision: SemanticDecision = decision;
    let updatedSubmission: SubmissionRow = submission;

    if (decision === "accepted") {
      const acceptResult = await acceptSubmissionAtomically(submissionId, ["verifying", "manual_review"]);

      if (acceptResult.ok) {
        updatedSubmission = acceptResult.submission;
      } else if (acceptResult.reason === "MISSION_NOT_ACTIVE" || acceptResult.reason === "MISSION_TARGET_REACHED") {
        // The semantic decision was accepted, but capacity/mission state
        // moved on since M2 passed — route to manual_review rather than
        // silently failing or force-accepting past capacity.
        finalDecision = "manual_review";
        const amendedReason = `${reason} (semantic decision was accepted, but routed to manual_review: ${
          acceptResult.reason === "MISSION_NOT_ACTIVE"
            ? "mission is no longer active"
            : "mission has already reached its target"
        }.)`;
        await persist(finalDecision, amendedReason);
        const fallback = await markSubmissionAfterAi(submissionId, "manual_review");
        updatedSubmission = fallback ?? (await getSubmissionById(submissionId)) ?? submission;
      } else if (acceptResult.reason === "SUBMISSION_NOT_ELIGIBLE") {
        throw ApiError.submissionFinalized(
          `Submission ${submissionId} was finalized concurrently; AI evidence has been recorded.`,
        );
      } else {
        throw ApiError.databaseError(
          `Unexpected conflict accepting submission ${submissionId}: ${acceptResult.reason}.`,
        );
      }
    } else {
      const updated = await markSubmissionAfterAi(submissionId, decision);
      updatedSubmission = updated ?? (await getSubmissionById(submissionId)) ?? submission;
    }

    void updatedSubmission; // reserved for future audit logging; not part of the response contract.

    const body: AiVerifyResponseDto = {
      submissionId,
      decision: finalDecision,
      semanticScore,
      modelConfidence: aiResult.overallConfidence,
      criteriaVersion: CRITERIA_VERSION,
      semanticVersion: SEMANTIC_DECISION_VERSION,
      provider: metadata.provider,
      model: metadata.model,
      criteria: aiResult.criteria,
    };

    return NextResponse.json(body, { status: 200 });
  });
}
