// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Canonical dataset metadata + metadataHash (M5 Part I). Deliberately
// separate from the sample leaves/Merkle root — this hashes the dataset's
// own descriptive facts (which mission, how many samples, which pipeline
// versions produced them), not the sample data itself.

import { keccak256, toBytes } from "viem";
import { VERIFICATION_VERSIONS } from "./manifest";

export const METADATA_CANONICAL_VERSION = "metadata-canonical-v1";
// Same algorithm as the Merkle leaves, for the same reason (see merkle.ts).
export const METADATA_HASH_ALGORITHM = "keccak256(utf8 bytes of serializeDatasetMetadata(...))";

export interface DatasetMetadataInput {
  missionId: string;
  chainMissionId: string;
  sampleCount: number;
  canonicalVersion: string;
}

export function serializeDatasetMetadata(input: DatasetMetadataInput): string {
  return [
    METADATA_CANONICAL_VERSION,
    input.missionId,
    input.chainMissionId,
    String(input.sampleCount),
    input.canonicalVersion,
    VERIFICATION_VERSIONS.deterministic,
    VERIFICATION_VERSIONS.criteria,
    VERIFICATION_VERSIONS.semantic,
  ].join("|");
}

export function computeMetadataHash(input: DatasetMetadataInput): `0x${string}` {
  return keccak256(toBytes(serializeDatasetMetadata(input)));
}
