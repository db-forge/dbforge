-- M1: media metadata columns for server-side upload pipeline.
-- Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
--
-- Additive only — does not touch 0001. media_url is kept for the M0
-- metadata-only submission flow (POST /api/submissions); the new upload
-- pipeline (POST /api/submissions/upload) populates media_path instead,
-- which stores a private Supabase Storage object path rather than a
-- public URL.

alter table public.submissions
  add column if not exists media_path text,
  add column if not exists media_type text,
  -- Max supported size for M1 is 100 MB (video), which comfortably fits a
  -- 32-bit integer (max ~2.1 GB) — no need for bigint/precision handling.
  add column if not exists size_bytes integer check (size_bytes > 0);

-- Exact-duplicate guard: the same media hash cannot be submitted twice to
-- the same mission. This mirrors the app-level pre-check in
-- lib/supabase/submissions.ts and closes the race-condition window between
-- that check and the insert.
create unique index if not exists submissions_mission_media_hash_key
  on public.submissions (mission_id, media_hash)
  where media_hash is not null;
