-- M0 core schema: missions, submissions, verification_results
-- Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
--
-- Apply with the Supabase CLI:
--   supabase db push
-- or paste directly into the SQL editor of your Supabase project.

create extension if not exists pgcrypto;

-- =========================================================================
-- missions
-- =========================================================================
create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  chain_mission_id bigint,
  buyer_address text not null,
  title text not null,
  description text not null,
  -- numeric(38,18) gives 18 decimal places of precision (matches 18-decimal
  -- MON amounts) while comfortably holding on-chain wei-scale integers.
  reward_mon numeric(38, 18) not null check (reward_mon >= 0),
  target_count integer not null check (target_count > 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists missions_status_idx on public.missions (status);
create index if not exists missions_buyer_address_idx on public.missions (buyer_address);
create unique index if not exists missions_chain_mission_id_idx
  on public.missions (chain_mission_id)
  where chain_mission_id is not null;

-- =========================================================================
-- submissions
-- =========================================================================
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  contributor_address text not null,
  media_url text,
  media_hash text,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'verifying', 'accepted', 'rejected', 'paid')),
  confidence numeric(5, 4) check (confidence >= 0 and confidence <= 1),
  tx_hash text,
  created_at timestamptz not null default now()
);

create index if not exists submissions_mission_id_idx on public.submissions (mission_id);
create index if not exists submissions_contributor_address_idx
  on public.submissions (contributor_address);
create index if not exists submissions_status_idx on public.submissions (status);

-- =========================================================================
-- verification_results
-- =========================================================================
create table if not exists public.verification_results (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  technical_valid boolean not null,
  duplicate_detected boolean not null,
  ai_valid boolean,
  ai_confidence numeric(5, 4) check (ai_confidence >= 0 and ai_confidence <= 1),
  ai_reason text,
  final_decision text not null
    check (final_decision in ('accepted', 'rejected', 'pending')),
  created_at timestamptz not null default now()
);

create index if not exists verification_results_submission_id_idx
  on public.verification_results (submission_id);

-- =========================================================================
-- Row Level Security
-- =========================================================================
-- All application access goes through the server-side service role client
-- (lib/supabase/client.ts), which bypasses RLS by design. RLS is enabled
-- here with no policies so that anon/authenticated keys are denied by
-- default if they are ever used against these tables directly.
alter table public.missions enable row level security;
alter table public.submissions enable row level security;
alter table public.verification_results enable row level security;
