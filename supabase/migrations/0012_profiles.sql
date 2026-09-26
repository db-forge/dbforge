-- Auth layer: profiles table linked 1:1 to Supabase Auth users.
-- Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
--
-- Additive only — does not rewrite 0001-0011. Identity itself (email,
-- password hashing, sessions) is entirely Supabase Auth's (auth.users) —
-- this table only holds our own account-type/profile data.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('contributor', 'company')),
  display_name text,
  company_name text,
  -- Normalized lowercase at write time (lib/supabase/profiles.ts); the
  -- unique index below is belt-and-suspenders against anything that
  -- inserts a differently-cased duplicate some other way.
  wallet_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One wallet identifies at most one account.
create unique index if not exists profiles_wallet_address_key
  on public.profiles (lower(wallet_address))
  where wallet_address is not null;

alter table public.profiles enable row level security;

-- A user may read and update their own profile row...
create policy "profiles_select_own" on public.profiles
  for select
  using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ...but column-level grants restrict what "update" actually lets an
-- authenticated user touch: never `role` or `id`, so a direct PostgREST
-- call (bypassing our API) can never grant/escalate an account's role.
-- No insert/delete policy: profile rows are only ever created by our
-- signup routes via the service-role client.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on table public.profiles to authenticated;
    grant update (display_name, company_name, wallet_address) on table public.profiles to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.profiles from anon;
  end if;
end $$;

-- service_role bypasses RLS (project convention) and needs full access to
-- create/manage profiles server-side during signup/login/guards.
grant select, insert, update, delete on table public.profiles to service_role;
