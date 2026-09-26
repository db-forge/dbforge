// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Pure types for the M2 deterministic verification pipeline. No I/O here —
// see lib/supabase/verification.ts and lib/supabase/submissions.ts for the
// async data fetching/persistence that assembles a VerificationContext and
// stores a VerificationOutcome.

import type { MissionRow, SubmissionRow } from "@/lib/supabase/types";

export type CheckCategory = "state" | "media" | "fraud" | "quality";
export type CheckSeverity = "hard_fail" | "warning" | "info";

export interface CheckResult {
  id: string;
  category: CheckCategory;
  passed: boolean;
  severity: CheckSeverity;
  score?: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

// Values a hard-fail check maps to, surfaced as `failureCode` in the API
// response when technicalValid is false. Note this is distinct from
// ApiErrorCode (app/api/_lib/errors.ts): these are outcomes of a completed,
// successful pipeline run (a deterministic rejection), not HTTP error
// envelopes. SUBMISSION_NOT_FOUND/SUBMISSION_FINALIZED never appear here —
// they're pre-conditions checked before the pipeline runs at all.
export type FailureCode =
  | "MISSION_NOT_FOUND"
  | "MISSION_NOT_ACTIVE"
  | "MISSION_TARGET_REACHED"
  | "INVALID_SUBMISSION_STATE"
  | "MEDIA_NOT_FOUND"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "FILE_TOO_LARGE"
  | "MEDIA_OBJECT_MISSING"
  | "DUPLICATE_SUBMISSION"
  | "INVALID_CONTRIBUTOR_ADDRESS"
  | "VERIFICATION_FAILED";

export const FINAL_SUBMISSION_STATUSES: readonly SubmissionRow["status"][] = [
  "accepted",
  "rejected",
  "paid",
];

export const VERIFICATION_VERSION = "deterministic-v1";

/**
 * Fully-resolved input to the pure pipeline. All async I/O (fetching the
 * submission/mission, checking storage existence, querying for hash
 * collisions) happens before this is built.
 */
export interface VerificationContext {
  submission: SubmissionRow;
  mission: MissionRow | null;
  storageObjectExists: boolean;
  // Other submissions sharing (mission_id, media_hash), excluding this one.
  otherSubmissionsWithSameHash: readonly SubmissionRow[];
  now: Date;
}

export interface VerificationOutcome {
  checks: CheckResult[];
  technicalValid: boolean;
  technicalScore: number;
  duplicateDetected: boolean;
  failureCode: FailureCode | null;
  readyForAi: boolean;
  startedAt: string;
  completedAt: string;
  verificationVersion: string;
}
