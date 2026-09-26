// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Data access for the verification_results table.

import { getSupabaseServiceClient } from "./client";
import type { FinalDecision, VerificationResultRow } from "./types";

export interface UpsertVerificationResultInput {
  submissionId: string;
  technicalValid: boolean;
  technicalScore: number;
  duplicateDetected: boolean;
  checks: unknown;
  startedAt: string;
  completedAt: string;
  verificationVersion: string;
  failureCode: string | null;
  finalDecision: FinalDecision;
}

/**
 * One verification_results row per submission: upserts by submission_id
 * (see the unique index added in migration 0005) so a retried verification
 * updates the existing deterministic record instead of piling up rows.
 * Only the columns listed here are touched — ai_valid/ai_confidence/
 * ai_reason are left alone, since M3 owns those.
 */
export async function upsertVerificationResult(
  input: UpsertVerificationResultInput,
): Promise<VerificationResultRow> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("verification_results")
    .upsert(
      {
        submission_id: input.submissionId,
        technical_valid: input.technicalValid,
        technical_score: input.technicalScore,
        duplicate_detected: input.duplicateDetected,
        checks: input.checks,
        started_at: input.startedAt,
        completed_at: input.completedAt,
        verification_version: input.verificationVersion,
        failure_code: input.failureCode,
        final_decision: input.finalDecision,
      },
      { onConflict: "submission_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Failed to persist verification result for submission ${input.submissionId}: ${error.message}`,
    );
  }

  return data as VerificationResultRow;
}

export interface UpsertAiVerificationResultInput {
  submissionId: string;
  aiProvider: string;
  aiModel: string;
  aiResult: unknown;
  aiValid: boolean;
  aiConfidence: number;
  aiReason: string;
  semanticScore: number;
  criteriaVersion: string;
  aiStartedAt: string;
  aiCompletedAt: string;
  finalDecision: FinalDecision;
}

/**
 * Records the M3 AI stage onto the EXISTING verification_results row for
 * this submission (a plain update, not upsert) — a row must already exist,
 * since reaching this point requires M2's deterministic pass to have
 * created one. Only AI columns + final_decision are touched; the M2
 * deterministic columns (technical_valid, checks, etc.) are left as-is.
 */
export async function recordAiVerificationResult(
  input: UpsertAiVerificationResultInput,
): Promise<VerificationResultRow> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("verification_results")
    .update({
      ai_provider: input.aiProvider,
      ai_model: input.aiModel,
      ai_result: input.aiResult,
      ai_valid: input.aiValid,
      ai_confidence: input.aiConfidence,
      ai_reason: input.aiReason,
      semantic_score: input.semanticScore,
      criteria_version: input.criteriaVersion,
      ai_started_at: input.aiStartedAt,
      ai_completed_at: input.aiCompletedAt,
      final_decision: input.finalDecision,
    })
    .eq("submission_id", input.submissionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Failed to persist AI verification result for submission ${input.submissionId}: ${error.message}`,
    );
  }

  return data as VerificationResultRow;
}

export async function getVerificationResultBySubmissionId(
  submissionId: string,
): Promise<VerificationResultRow | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("verification_results")
    .select("*")
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch verification result for ${submissionId}: ${error.message}`);
  }

  return (data as VerificationResultRow | null) ?? null;
}
