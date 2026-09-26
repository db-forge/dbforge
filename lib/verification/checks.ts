// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Pure deterministic checks for the M2 verification pipeline. Every check
// is a synchronous function of a fully-resolved VerificationContext — no
// network/DB calls happen here, which keeps this module trivially testable
// with plain object fixtures.

import { getMediaTypeConfig } from "./media";
import type { CheckCategory, CheckResult, CheckSeverity, FailureCode, VerificationContext } from "./types";
import { FINAL_SUBMISSION_STATUSES } from "./types";

// Duplicated intentionally rather than importing from app/api/_lib/validation:
// lib/verification must stay dependency-free of the app/api layer so it can
// be unit tested in isolation (app/api depends on lib/verification, not the
// other way around).
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

interface CheckDefinition {
  id: string;
  category: CheckCategory;
  severity: CheckSeverity;
  failureCode: FailureCode;
  evaluate: (ctx: VerificationContext) => {
    passed: boolean;
    reason: string;
    metadata?: Record<string, unknown>;
  };
}

const CHECK_DEFINITIONS: readonly CheckDefinition[] = [
  // ---- state ----
  {
    id: "submission_exists",
    category: "state",
    severity: "hard_fail",
    // Unreachable in practice: the route only builds a context once the
    // submission has been loaded. Included so the persisted audit trail is
    // self-contained per the M2 spec's required check list.
    failureCode: "VERIFICATION_FAILED",
    evaluate: () => ({ passed: true, reason: "Submission record loaded." }),
  },
  {
    id: "mission_exists",
    category: "state",
    severity: "hard_fail",
    failureCode: "MISSION_NOT_FOUND",
    evaluate: (ctx) =>
      ctx.mission
        ? { passed: true, reason: "Mission record loaded." }
        : {
            passed: false,
            reason: `Mission ${ctx.submission.mission_id} was not found.`,
          },
  },
  {
    id: "mission_active",
    category: "state",
    severity: "hard_fail",
    failureCode: "MISSION_NOT_ACTIVE",
    evaluate: (ctx) => {
      if (!ctx.mission) {
        return { passed: false, reason: "Mission is unavailable; cannot verify active status." };
      }
      const passed = ctx.mission.status === "active";
      return {
        passed,
        reason: passed
          ? "Mission is active."
          : `Mission status is '${ctx.mission.status}', expected 'active'.`,
      };
    },
  },
  {
    id: "mission_target_not_reached",
    category: "state",
    severity: "hard_fail",
    failureCode: "MISSION_TARGET_REACHED",
    evaluate: (ctx) => {
      if (!ctx.mission) {
        return { passed: false, reason: "Mission is unavailable; cannot verify capacity." };
      }
      const passed = ctx.mission.accepted_count < ctx.mission.target_count;
      return {
        passed,
        reason: passed
          ? `Mission has capacity (${ctx.mission.accepted_count}/${ctx.mission.target_count} accepted).`
          : `Mission target already reached (${ctx.mission.accepted_count}/${ctx.mission.target_count}).`,
        metadata: {
          acceptedCount: ctx.mission.accepted_count,
          targetCount: ctx.mission.target_count,
        },
      };
    },
  },
  {
    id: "submission_not_finalized",
    category: "state",
    severity: "hard_fail",
    failureCode: "INVALID_SUBMISSION_STATE",
    evaluate: (ctx) => {
      const passed = !FINAL_SUBMISSION_STATUSES.includes(ctx.submission.status);
      return {
        passed,
        reason: passed
          ? "Submission is not in a finalized state."
          : `Submission is already finalized (status: ${ctx.submission.status}).`,
      };
    },
  },

  // ---- media ----
  {
    id: "media_path_present",
    category: "media",
    severity: "hard_fail",
    failureCode: "MEDIA_NOT_FOUND",
    evaluate: (ctx) => {
      const passed = Boolean(ctx.submission.media_path);
      return { passed, reason: passed ? "media_path is present." : "media_path is missing." };
    },
  },
  {
    id: "media_hash_present",
    category: "media",
    severity: "hard_fail",
    failureCode: "MEDIA_NOT_FOUND",
    evaluate: (ctx) => {
      const passed = Boolean(ctx.submission.media_hash);
      return { passed, reason: passed ? "media_hash is present." : "media_hash is missing." };
    },
  },
  {
    id: "media_type_supported",
    category: "media",
    severity: "hard_fail",
    failureCode: "UNSUPPORTED_MEDIA_TYPE",
    evaluate: (ctx) => {
      const mediaType = ctx.submission.media_type;
      const passed = Boolean(mediaType && getMediaTypeConfig(mediaType));
      return {
        passed,
        reason: passed
          ? `Media type '${mediaType}' is supported.`
          : `Media type '${mediaType ?? "(none)"}' is not supported.`,
      };
    },
  },
  {
    id: "size_bytes_present",
    category: "media",
    severity: "hard_fail",
    failureCode: "MEDIA_NOT_FOUND",
    evaluate: (ctx) => {
      const passed = typeof ctx.submission.size_bytes === "number" && ctx.submission.size_bytes > 0;
      return {
        passed,
        reason: passed ? "size_bytes is present." : "size_bytes is missing or non-positive.",
      };
    },
  },
  {
    id: "size_within_limit",
    category: "media",
    severity: "hard_fail",
    failureCode: "FILE_TOO_LARGE",
    evaluate: (ctx) => {
      const config = ctx.submission.media_type ? getMediaTypeConfig(ctx.submission.media_type) : undefined;
      if (!config || typeof ctx.submission.size_bytes !== "number") {
        return {
          passed: false,
          reason: "Cannot verify size limit without a supported media type and a known size.",
        };
      }
      const passed = ctx.submission.size_bytes <= config.maxSizeBytes;
      return {
        passed,
        reason: passed
          ? `Size ${ctx.submission.size_bytes} bytes is within the ${config.maxSizeBytes} byte limit.`
          : `Size ${ctx.submission.size_bytes} bytes exceeds the ${config.maxSizeBytes} byte limit.`,
        metadata: { sizeBytes: ctx.submission.size_bytes, maxSizeBytes: config.maxSizeBytes },
      };
    },
  },
  {
    id: "storage_object_exists",
    category: "media",
    severity: "hard_fail",
    failureCode: "MEDIA_OBJECT_MISSING",
    evaluate: (ctx) => ({
      passed: ctx.storageObjectExists,
      reason: ctx.storageObjectExists
        ? "Private media object exists in storage."
        : "Media object was not found in storage.",
      metadata: { mediaPath: ctx.submission.media_path },
    }),
  },

  // ---- fraud ----
  {
    id: "duplicate_hash_any_contributor",
    category: "fraud",
    severity: "hard_fail",
    failureCode: "DUPLICATE_SUBMISSION",
    // The DB unique index on (mission_id, media_hash) (migration 0002) is
    // the final authority against a race between two concurrent uploads;
    // this check only reflects what a query saw at pipeline run time.
    evaluate: (ctx) => {
      const passed = ctx.otherSubmissionsWithSameHash.length === 0;
      return {
        passed,
        reason: passed
          ? "No other submission shares this exact media hash for this mission."
          : `${ctx.otherSubmissionsWithSameHash.length} other submission(s) share this exact media hash for this mission.`,
        metadata: {
          conflictingSubmissionIds: ctx.otherSubmissionsWithSameHash.map((s) => s.id),
        },
      };
    },
  },
  {
    id: "duplicate_hash_same_contributor",
    category: "fraud",
    severity: "hard_fail",
    failureCode: "DUPLICATE_SUBMISSION",
    evaluate: (ctx) => {
      const matches = ctx.otherSubmissionsWithSameHash.filter(
        (s) => s.contributor_address === ctx.submission.contributor_address,
      );
      const passed = matches.length === 0;
      return {
        passed,
        reason: passed
          ? "This contributor has not submitted this exact media to this mission before."
          : "This contributor already submitted this exact media to this mission.",
        metadata: { conflictingSubmissionIds: matches.map((s) => s.id) },
      };
    },
  },

  // ---- address ----
  {
    id: "contributor_address_valid",
    category: "fraud",
    severity: "hard_fail",
    failureCode: "INVALID_CONTRIBUTOR_ADDRESS",
    evaluate: (ctx) => {
      const passed = EVM_ADDRESS_RE.test(ctx.submission.contributor_address);
      return {
        passed,
        reason: passed
          ? "contributor_address is a syntactically valid EVM address."
          : "contributor_address is not a syntactically valid EVM address.",
      };
    },
  },
];

const FAILURE_CODE_BY_CHECK_ID: ReadonlyMap<string, FailureCode> = new Map(
  CHECK_DEFINITIONS.map((def) => [def.id, def.failureCode]),
);

export function getFailureCodeForCheckId(id: string): FailureCode {
  return FAILURE_CODE_BY_CHECK_ID.get(id) ?? "VERIFICATION_FAILED";
}

export function runAllChecks(ctx: VerificationContext): CheckResult[] {
  return CHECK_DEFINITIONS.map((def) => {
    const result = def.evaluate(ctx);
    return {
      id: def.id,
      category: def.category,
      severity: def.severity,
      passed: result.passed,
      reason: result.reason,
      ...(result.metadata !== undefined ? { metadata: result.metadata } : {}),
    };
  });
}
