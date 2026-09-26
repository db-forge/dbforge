// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Normalized mission criteria for AI semantic verification (M3).
//
// The current mission schema (title/description free text, see
// supabase/migrations/0001_init_core_schema.sql) has no structured
// requirements field. Rather than use an LLM call to *invent* criteria
// (extra cost/latency/non-determinism for something that should be
// authored, not guessed), this builds criteria deterministically by
// splitting the mission description into sentences — each sentence becomes
// one required, hard-fail criterion.
//
// This is an intentionally simple heuristic, not semantic understanding:
// it will not split "the bottle and hand must remain visible" into two
// criteria the way a human curator would. Production usage should replace
// this entirely with structured, buyer-authored criteria (e.g. a
// `mission_criteria` table) — this builder exists so M3 has *something*
// deterministic and auditable to evaluate against for the hackathon.

export const CRITERIA_VERSION = "criteria-v1";

export interface Criterion {
  id: string;
  description: string;
  type: "required" | "optional";
  weight: number;
  hardFail: boolean;
}

const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+/;
const MIN_SENTENCE_LENGTH = 3;

export function buildMissionCriteria(mission: {
  title: string;
  description: string;
}): Criterion[] {
  const sentences = mission.description
    .split(SENTENCE_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_SENTENCE_LENGTH);

  const source = sentences.length > 0 ? sentences : [mission.title.trim()];

  return source.map((description, index) => ({
    id: `criterion_${index + 1}`,
    description,
    type: "required",
    weight: 1,
    hardFail: true,
  }));
}
