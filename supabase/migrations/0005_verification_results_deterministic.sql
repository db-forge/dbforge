-- M2: deterministic verification enrichment for verification_results.
-- Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
--
-- Additive only — does not rewrite 0001. AI fields (ai_valid, ai_confidence,
-- ai_reason) and final_decision already exist and are left as-is; M3
-- populates ai_* by updating the same row.
--
-- One verification_results row per submission: the M2 write path is an
-- upsert keyed on submission_id (see lib/supabase/verification.ts), so a
-- unique constraint on submission_id is required. Nothing has written to
-- this table before M2 in any environment, so adding NOT NULL columns and
-- the unique index here is safe without a backfill/dedup step.

alter table public.verification_results
  add column if not exists technical_score numeric(5, 4) not null
    check (technical_score >= 0 and technical_score <= 1),
  add column if not exists checks jsonb not null default '[]'::jsonb,
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz not null default now(),
  add column if not exists verification_version text not null default 'deterministic-v1',
  -- Free text, not constrained to a check-in-list: the source of truth for
  -- valid values is the FailureCode union in lib/verification/types.ts,
  -- which is expected to grow (M3 AI failure codes, etc.).
  add column if not exists failure_code text;

create unique index if not exists verification_results_submission_id_key
  on public.verification_results (submission_id);
