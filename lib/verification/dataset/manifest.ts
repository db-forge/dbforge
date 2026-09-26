// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Dataset manifest content (M5 Part H). No private media URLs, no signed
// URLs, no secrets — only the facts needed to prove provenance: which
// submissions, their (already-public-once-settled) on-chain-adjacent
// facts, and which pipeline versions produced them.

import { SAMPLE_CANONICAL_VERSION } from "./canonical";
import type { CanonicalSample } from "./canonical";

// Pins the exact pipeline versions that produced this dataset's samples,
// so a manifest is fully self-describing even if these versions change
// later. Kept as plain string literals (not re-exported from each
// milestone's own module) so this file has no runtime dependency on the
// AI/decision modules just to describe them.
export const VERIFICATION_VERSIONS = {
  deterministic: "deterministic-v1",
  criteria: "criteria-v1",
  semantic: "semantic-v1",
} as const;

export interface DatasetManifestSample {
  submissionId: string;
  mediaHash: string;
  contributorAddress: string;
  settlementTxHash: string;
  semanticScore: string;
}

export interface DatasetManifest {
  datasetId: string;
  missionId: string;
  chainMissionId: string;
  sampleCount: number;
  canonicalVersion: string;
  verificationVersions: typeof VERIFICATION_VERSIONS;
  samples: DatasetManifestSample[];
}

export function buildDatasetManifest(input: {
  datasetId: string;
  missionId: string;
  chainMissionId: string;
  canonicalSamples: readonly CanonicalSample[];
}): DatasetManifest {
  return {
    datasetId: input.datasetId,
    missionId: input.missionId,
    chainMissionId: input.chainMissionId,
    sampleCount: input.canonicalSamples.length,
    canonicalVersion: SAMPLE_CANONICAL_VERSION,
    verificationVersions: VERIFICATION_VERSIONS,
    samples: input.canonicalSamples.map((s) => ({
      submissionId: s.submissionId,
      mediaHash: s.mediaHash,
      contributorAddress: s.contributorAddress,
      settlementTxHash: s.settlementTxHash,
      semanticScore: s.semanticScore,
    })),
  };
}
