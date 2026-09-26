// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Deterministic policy engine over AI evidence. The model never decides DB
// state directly — it only returns per-criterion evidence and a media
// quality assessment; this module is the single place that turns that
// evidence into accepted/rejected/manual_review.

import type { Criterion } from "./criteria";
import type { VisionVerificationResult } from "./ai/types";

export const SEMANTIC_DECISION_VERSION = "semantic-v1";

export type SemanticDecision = "accepted" | "rejected" | "manual_review";

export interface DecisionResult {
  decision: SemanticDecision;
  semanticScore: number;
  reason: string;
}

// A hard-fail criterion (or unusable media) only rejects outright once the
// model is reasonably confident about it — a low-confidence "failed" call
// shouldn't hard-reject on its own; it just drags the weighted score down.
const HARD_FAIL_CONFIDENCE_THRESHOLD = 0.75;
const ACCEPT_SCORE_THRESHOLD = 0.85;
const REJECT_SCORE_THRESHOLD = 0.6;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Scoring formula:
 *   semanticScore = clamp01( sum(signed(criterion) * weight) / sum(weight) )
 *   where signed(criterion) = +confidence if passed, -confidence if failed.
 *
 * A passed criterion contributes its confidence (weighted); a failed one
 * *subtracts* its confidence (weighted) rather than contributing zero —
 * "penalize failed criteria" per the M3 spec, so a confidently-failed
 * optional criterion still pulls the score down instead of being ignored,
 * and a swing of failures can't be masked by a handful of easy passes.
 */
function computeSemanticScore(
  criteria: readonly Criterion[],
  aiResult: VisionVerificationResult,
): number {
  const evidenceById = new Map(aiResult.criteria.map((c) => [c.criterionId, c]));
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0) || 1;

  let scoreSum = 0;
  for (const criterion of criteria) {
    const evidence = evidenceById.get(criterion.id);
    if (!evidence) {
      // Unreachable once schema validation has run (every input criterion
      // is guaranteed a matching result) — defensive full penalty in case
      // this is ever called directly with unvalidated input.
      scoreSum -= criterion.weight;
      continue;
    }
    scoreSum += (evidence.passed ? evidence.confidence : -evidence.confidence) * criterion.weight;
  }

  return round2(Math.max(0, Math.min(1, scoreSum / totalWeight)));
}

export function decideSemanticOutcome(
  criteria: readonly Criterion[],
  aiResult: VisionVerificationResult,
): DecisionResult {
  const evidenceById = new Map(aiResult.criteria.map((c) => [c.criterionId, c]));

  for (const criterion of criteria) {
    if (!criterion.hardFail) continue;
    const evidence = evidenceById.get(criterion.id);
    if (evidence && !evidence.passed && evidence.confidence >= HARD_FAIL_CONFIDENCE_THRESHOLD) {
      return {
        decision: "rejected",
        semanticScore: 0,
        reason: `Hard-fail criterion "${criterion.id}" failed (confidence ${evidence.confidence}): ${evidence.evidence}`,
      };
    }
  }

  if (
    !aiResult.mediaQuality.usable &&
    aiResult.mediaQuality.confidence >= HARD_FAIL_CONFIDENCE_THRESHOLD
  ) {
    return {
      decision: "rejected",
      semanticScore: 0,
      reason: `Media quality is unusable (confidence ${aiResult.mediaQuality.confidence}): ${
        aiResult.mediaQuality.issues.join("; ") || "no details given"
      }`,
    };
  }

  const semanticScore = computeSemanticScore(criteria, aiResult);
  const allRequiredPass = criteria
    .filter((c) => c.type === "required")
    .every((c) => evidenceById.get(c.id)?.passed === true);

  if (semanticScore >= ACCEPT_SCORE_THRESHOLD && allRequiredPass) {
    return { decision: "accepted", semanticScore, reason: aiResult.reason };
  }

  if (semanticScore < REJECT_SCORE_THRESHOLD) {
    return { decision: "rejected", semanticScore, reason: aiResult.reason };
  }

  return { decision: "manual_review", semanticScore, reason: aiResult.reason };
}
