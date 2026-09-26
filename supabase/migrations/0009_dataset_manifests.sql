-- M5 Parts G/N: dataset manifests with versioning.
-- Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
--
-- Additive only. One row per (mission_id, version). A not-yet-anchored
-- version can be rebuilt in place (app code updates the same row); once
-- 'anchored', a row is never mutated again — a new build instead inserts
-- version + 1. See lib/supabase/datasetManifests.ts.

create table if not exists public.dataset_manifests (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id),
  version integer not null default 1 check (version >= 1),
  chain_mission_id text not null,
  sample_count integer not null check (sample_count >= 0),
  canonical_version text not null,
  -- text, not a hash/bytea type — see migration 0007's reasoning for why
  -- money/hash fields are stored as text project-wide.
  merkle_root text not null,
  metadata_hash text not null,
  manifest jsonb not null,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'anchoring', 'anchored', 'failed')),
  anchor_tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  anchored_at timestamptz,
  unique (mission_id, version)
);

create index if not exists dataset_manifests_mission_id_idx on public.dataset_manifests (mission_id);
create unique index if not exists dataset_manifests_anchor_tx_hash_key
  on public.dataset_manifests (anchor_tx_hash)
  where anchor_tx_hash is not null;

alter table public.dataset_manifests enable row level security;

grant select, insert, update, delete on table public.dataset_manifests to service_role;
