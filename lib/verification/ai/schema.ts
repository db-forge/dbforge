// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Strict structured-output validation for vision provider results. No
// free-form parsing is trusted — a provider's raw JSON must pass this
// schema, and must return exactly one result per requested criterion id,
// before anything downstream (scoring, persistence, state transitions)
// touches it.

import { z } from "zod";
import { VisionProviderError } from "./types";
import type { VisionVerificationResult } from "./types";

const confidence = z.number().min(0).max(1);

const criterionEvidenceSchema = z.object({
  criterionId: z.string().min(1),
  passed: z.boolean(),
  confidence,
  evidence: z.string().min(1),
});

const visionVerificationResultSchema = z.object({
  valid: z.boolean(),
  overallConfidence: confidence,
  criteria: z.array(criterionEvidenceSchema),
  mediaQuality: z.object({
    usable: z.boolean(),
    confidence,
    issues: z.array(z.string()),
  }),
  reason: z.string().min(1),
});

/**
 * Validates a provider's raw parsed JSON against the strict result schema,
 * then checks it returned exactly one result per expected criterion id (no
 * missing, no unknown/invented ids). Throws VisionProviderError("invalid_response")
 * on any failure — callers must never fall back to trusting unvalidated
 * output.
 */
export function validateVisionResult(
  raw: unknown,
  expectedCriterionIds: readonly string[],
): VisionVerificationResult {
  const parsed = visionVerificationResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new VisionProviderError(
      `Model output failed schema validation: ${parsed.error.message}`,
      "invalid_response",
      parsed.error,
    );
  }

  const expected = new Set(expectedCriterionIds);
  const returned = new Set(parsed.data.criteria.map((c) => c.criterionId));

  if (expected.size !== returned.size || [...expected].some((id) => !returned.has(id))) {
    throw new VisionProviderError(
      "Model result criteria do not exactly match the requested criterion IDs.",
      "invalid_response",
      { expected: [...expected], returned: [...returned] },
    );
  }

  return parsed.data;
}
