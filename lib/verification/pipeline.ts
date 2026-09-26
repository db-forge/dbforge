// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Pure entry point for the M2 deterministic verification pipeline. Takes a
// fully-resolved VerificationContext (all async I/O already done by the
// caller) and returns a complete, JSON-serializable outcome — no DB/storage
// calls happen in this module, which is what makes it trivially testable
// with plain object fixtures.

import { runAllChecks } from "./checks";
import { isDuplicateDetected, scoreChecks } from "./scoring";
import { VERIFICATION_VERSION, type VerificationContext, type VerificationOutcome } from "./types";

export { VERIFICATION_VERSION };

export function runVerificationPipeline(ctx: VerificationContext): VerificationOutcome {
  // The pipeline itself is synchronous, so started/completed are the same
  // instant — that's accurate, not a placeholder.
  const timestamp = ctx.now.toISOString();

  const checks = runAllChecks(ctx);
  const { technicalValid, technicalScore, failureCode } = scoreChecks(checks);

  return {
    checks,
    technicalValid,
    technicalScore,
    duplicateDetected: isDuplicateDetected(checks),
    failureCode,
    readyForAi: technicalValid,
    startedAt: timestamp,
    completedAt: timestamp,
    verificationVersion: VERIFICATION_VERSION,
  };
}
