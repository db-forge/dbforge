// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Data access for building an eligible dataset sample set (M5 Part B).
// Deliberately three simple, separately-typed queries joined in
// application code rather than one PostgREST resource-embedding query —
// embedded-relation shapes (array vs single object for a to-one relation)
// are ambiguous without generated types, and getting this wrong would
// silently corrupt dataset eligibility. Simple and correct beats clever
// here; this table is not a hot path.

import { getSupabaseServiceClient } from "./client";

export interface EligibleDatasetSample {
  submissionId: string;
  missionId: string;
  mediaHash: string;
  contributorAddress: string;
  settlementTxHash: string;
  semanticScore: number | null;
}

/**
 * Returns every sample eligible for a mission's dataset:
 *   submission.status = 'paid'
 *   AND verification_results.final_decision = 'accepted'
 *   AND settlements.status = 'confirmed' (settlement tx hash present)
 *   AND media_hash / contributor_address present
 *
 * Sorted by submissionId ascending in application code (canonical-v1
 * ordering, see lib/verification/dataset/canonical.ts) — never relying on
 * whatever order Postgres happens to return rows in.
 */
export async function listEligibleDatasetSamples(
  missionId: string,
): Promise<EligibleDatasetSample[]> {
  const supabase = getSupabaseServiceClient();

  const { data: submissions, error: subError } = await supabase
    .from("submissions")
    .select("id, mission_id, media_hash, contributor_address")
    .eq("mission_id", missionId)
    .eq("status", "paid")
    .not("media_hash", "is", null)
    .not("contributor_address", "is", null);

  if (subError) {
    throw new Error(`Failed to list paid submissions for mission ${missionId}: ${subError.message}`);
  }
  if (!submissions || submissions.length === 0) return [];

  const submissionIds = submissions.map((s) => s.id);

  const { data: verifications, error: verError } = await supabase
    .from("verification_results")
    .select("submission_id, final_decision, semantic_score")
    .in("submission_id", submissionIds)
    .eq("final_decision", "accepted");

  if (verError) {
    throw new Error(`Failed to load verification results: ${verError.message}`);
  }

  const { data: settlements, error: setError } = await supabase
    .from("settlements")
    .select("submission_id, status, tx_hash")
    .in("submission_id", submissionIds)
    .eq("status", "confirmed");

  if (setError) {
    throw new Error(`Failed to load settlements: ${setError.message}`);
  }

  const semanticScoreById = new Map(
    (verifications ?? []).map((v) => [v.submission_id as string, v.semantic_score as number | null]),
  );
  const txHashById = new Map(
    (settlements ?? [])
      .filter((s) => s.tx_hash)
      .map((s) => [s.submission_id as string, s.tx_hash as string]),
  );

  const eligible: EligibleDatasetSample[] = [];
  for (const s of submissions) {
    if (!semanticScoreById.has(s.id)) continue; // no accepted verification result
    const settlementTxHash = txHashById.get(s.id);
    if (!settlementTxHash) continue; // no confirmed settlement with a tx hash
    if (!s.media_hash || !s.contributor_address) continue; // defensive, already filtered above

    eligible.push({
      submissionId: s.id,
      missionId: s.mission_id,
      mediaHash: s.media_hash,
      contributorAddress: s.contributor_address,
      settlementTxHash,
      semanticScore: semanticScoreById.get(s.id) ?? null,
    });
  }

  // Canonical-v1 ordering: submission_id ASC. "This is critical" per the
  // M5 spec — enforced here in application code regardless of query/DB
  // return order.
  eligible.sort((a, b) =>
    a.submissionId < b.submissionId ? -1 : a.submissionId > b.submissionId ? 1 : 0,
  );

  return eligible;
}
