-- Persist the mission fields authored in the company UI so every browser
-- renders the same mission after the on-chain transaction is indexed.

alter table public.missions
  add column if not exists category text not null default 'gundelik'
    check (category in ('teknoloji', 'doga', 'gundelik')),
  add column if not exists cover_url text,
  add column if not exists per_user_limit integer not null default 5
    check (per_user_limit > 0),
  add column if not exists criteria jsonb not null default '[]'::jsonb
    check (jsonb_typeof(criteria) = 'array');
