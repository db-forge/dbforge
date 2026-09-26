// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Pure scoring/decision logic over a completed set of checks. Centralized
// here so the pass/fail and score rules live in exactly one place.
//
// M2 has no optional "quality" signals yet (the spec explicitly defers
// them), so every check defined in checks.ts is severity "hard_fail" —
// technicalScore therefore reduces to "fraction of checks passed," and
// technicalValid/technicalScore are tightly coupled (score is only ever
// 1.0 when valid). Once soft quality signals are introduced, this function
// is the place to weight them separately from technicalValid.

import { getFailureCodeForCheckId } from "./checks";
import type { CheckResult, FailureCode } from "./types";

export interface ScoringResult {
  technicalValid: boolean;
  technicalScore: number;
  failureCode: FailureCode | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function scoreChecks(checks: readonly CheckResult[]): ScoringResult {
  const firstHardFail = checks.find((c) => c.severity === "hard_fail" && !c.passed);
  const technicalValid = firstHardFail === undefined;

  const passedCount = checks.filter((c) => c.passed).length;
  const technicalScore = checks.length === 0 ? 0 : round2(passedCount / checks.length);

  return {
    technicalValid,
    technicalScore,
    failureCode: firstHardFail ? getFailureCodeForCheckId(firstHardFail.id) : null,
  };
}

const DUPLICATE_CHECK_IDS = new Set([
  "duplicate_hash_any_contributor",
  "duplicate_hash_same_contributor",
]);

export function isDuplicateDetected(checks: readonly CheckResult[]): boolean {
  return checks.some((c) => DUPLICATE_CHECK_IDS.has(c.id) && !c.passed);
}
