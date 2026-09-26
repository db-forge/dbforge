// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Provider-agnostic vision verification contract. lib/verification/ai/openai.ts
// is the only concrete implementation for M3; adding Gemini or another
// provider later means adding another file implementing VisionVerifier and
// extending the selection logic in lib/verification/ai/provider.ts — no
// changes needed anywhere else in the pipeline.

import type { Criterion } from "../criteria";

export interface VisionMediaFrame {
  index: number;
  timestampMs: number;
  mimeType: string;
  base64: string;
}

export interface VisionVerificationInput {
  missionTitle: string;
  missionDescription: string;
  criteria: readonly Criterion[];
  frames: readonly VisionMediaFrame[];
}

export interface CriterionEvidence {
  criterionId: string;
  passed: boolean;
  confidence: number;
  evidence: string;
}

export interface MediaQualityAssessment {
  usable: boolean;
  confidence: number;
  issues: string[];
}

// Strict structured output contract — see lib/verification/ai/schema.ts for
// the zod schema that validates a provider's raw JSON against this shape
// before anything downstream trusts it.
export interface VisionVerificationResult {
  valid: boolean;
  overallConfidence: number;
  criteria: CriterionEvidence[];
  mediaQuality: MediaQualityAssessment;
  reason: string;
}

export interface VisionCallMetadata {
  provider: string;
  model: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export type VisionProviderErrorKind =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "transient"
  | "invalid_response"
  | "unknown";

export class VisionProviderError extends Error {
  constructor(
    message: string,
    readonly kind: VisionProviderErrorKind,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "VisionProviderError";
  }
}

export interface VisionVerifier {
  readonly provider: string;
  readonly model: string;
  verify(
    input: VisionVerificationInput,
  ): Promise<{ result: VisionVerificationResult; metadata: VisionCallMetadata }>;
}
