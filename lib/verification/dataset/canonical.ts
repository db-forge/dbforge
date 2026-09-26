// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Canonical per-sample representation and serialization (M5 Parts C/D).
// The same sample set must always produce the same Merkle root, so every
// step here is deterministic: fixed field order, lowercase-normalized
// hex fields, a stable string form for semanticScore, and no timestamps.

export const SAMPLE_CANONICAL_VERSION = "sample-canonical-v1";

export interface CanonicalSampleInput {
  missionId: string;
  submissionId: string;
  mediaHash: string;
  contributorAddress: string;
  settlementTxHash: string;
  semanticScore: number | null;
}

export interface CanonicalSample {
  missionId: string;
  submissionId: string;
  mediaHash: string;
  contributorAddress: string;
  settlementTxHash: string;
  semanticScore: string;
}

function stableSemanticScoreString(score: number | null): string {
  if (score === null) return "null";
  // The pipeline (lib/verification/decision.ts) already rounds to 2
  // decimals before persisting — toFixed(2) here just guarantees the
  // *string form* is stable even if that ever changes (e.g. 0.9 vs 0.90).
  return score.toFixed(2);
}

export function canonicalizeSample(input: CanonicalSampleInput): CanonicalSample {
  return {
    missionId: input.missionId,
    submissionId: input.submissionId,
    mediaHash: input.mediaHash.toLowerCase(),
    contributorAddress: input.contributorAddress.toLowerCase(),
    settlementTxHash: input.settlementTxHash.toLowerCase(),
    semanticScore: stableSemanticScoreString(input.semanticScore),
  };
}

/**
 * Deterministic wire format used as the Merkle leaf hash input — fixed
 * field order via an explicit delimited join, never JSON.stringify on an
 * object whose key order isn't a documented format guarantee. Prefixed
 * with the version so a future format change can never silently produce
 * hashes that collide with this one.
 */
export function serializeCanonicalSample(sample: CanonicalSample): string {
  return [
    SAMPLE_CANONICAL_VERSION,
    sample.missionId,
    sample.submissionId,
    sample.mediaHash,
    sample.contributorAddress,
    sample.settlementTxHash,
    sample.semanticScore,
  ].join("|");
}
