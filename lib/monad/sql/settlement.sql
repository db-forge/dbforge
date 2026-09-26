-- DBForge · lib/monad settlement store — SQL DRAFT (G6, TASK-MUI9M2PQD7LKM)
--
-- Owner of this draft: Developer 2 (lib/monad). Developer 3 copies it into a migration under supabase/migrations/.
-- lib/monad never touches supabase/.
--
-- Semantics mirror lib/monad/store/memory.ts one to one (the same contract test runs against both).
-- Every function is a single statement block: plpgsql runs it in one transaction, and the row locks
-- (INSERT … ON CONFLICT, SELECT … FOR UPDATE) make it atomic across any number of server instances.
--
-- Access: the tables have RLS on and no policies, the functions are revoked from anon/authenticated.
-- Only the service role (server-side Supabase client) can use them.

create table if not exists public.monad_settlements (
  vault_address       text        not null check (vault_address ~ '^0x[0-9a-f]{40}$'),
  chain_mission_id    text        not null check (chain_mission_id ~ '^[1-9][0-9]{0,77}$'),
  submission_hash     text        not null check (submission_hash ~ '^0x[0-9a-f]{64}$'),
  contributor_address text        not null check (contributor_address ~ '^0x[0-9a-f]{40}$'),
  status              text        not null check (status in ('pending', 'settled', 'failed')),
  lease_owner         text,
  lease_expires_at    timestamptz,
  signer_address      text        check (signer_address ~ '^0x[0-9a-f]{40}$'),
  nonce               bigint      check (nonce >= 0),
  tx_hash             text        check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  raw_tx              text,       -- signed tx of the current attempt (public once broadcast; never a key)
  amount_wei          text        check (amount_wei ~ '^[0-9]{1,78}$'),
  attempts            integer     not null default 0,
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- The idempotency lock: one row per (vault, mission, hash) = ARCHITECTURE.md v2 replay key.
  primary key (vault_address, chain_mission_id, submission_hash)
);

create index if not exists monad_settlements_signer_open_idx
  on public.monad_settlements (signer_address, nonce)
  where status = 'pending' and tx_hash is null and nonce is not null;

create table if not exists public.signer_nonces (
  signer_address text        primary key check (signer_address ~ '^0x[0-9a-f]{40}$'),
  next_nonce     bigint      not null check (next_nonce >= 0),
  updated_at     timestamptz not null default now()
);

-- Nonces that were handed out but never consumed on chain (definitive broadcast rejection, abandoned job).
-- The next allocation takes the lowest one first, so the signer's nonce sequence has no hole.
create table if not exists public.signer_nonce_gaps (
  signer_address text   not null,
  nonce          bigint not null check (nonce >= 0),
  created_at     timestamptz not null default now(),
  primary key (signer_address, nonce)
);

alter table public.monad_settlements enable row level security;
alter table public.signer_nonces     enable row level security;
alter table public.signer_nonce_gaps enable row level security;

-- ---------------------------------------------------------------------------------------------------------------
-- Row → JSON in the shape SupabaseSettlementStore expects.
create or replace function public.monad_settlement_json(r public.monad_settlements)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'vault_address', r.vault_address, 'chain_mission_id', r.chain_mission_id, 'submission_hash', r.submission_hash,
    'contributor_address', r.contributor_address, 'status', r.status, 'lease_owner', r.lease_owner,
    'lease_expires_at_ms', (extract(epoch from r.lease_expires_at) * 1000)::bigint,
    'signer_address', r.signer_address, 'nonce', r.nonce, 'tx_hash', r.tx_hash, 'raw_tx', r.raw_tx,
    'amount_wei', r.amount_wei, 'attempts', r.attempts, 'last_error', r.last_error,
    'updated_at_ms', (extract(epoch from r.updated_at) * 1000)::bigint)
$$;

create or replace function public.monad_settlement_get(p_vault text, p_mission text, p_hash text)
returns jsonb language sql stable as $$
  select public.monad_settlement_json(s) from public.monad_settlements s
  where s.vault_address = p_vault and s.chain_mission_id = p_mission and s.submission_hash = p_hash
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Nonce allocation. Lock order everywhere: signer_nonces row first, then settlement rows.
drop function if exists public.monad_allocate_nonce(text, bigint);   -- pre-reconcile draft signature
create or replace function public.monad_allocate_nonce(p_signer text, p_chain_nonce bigint, p_idle_ms integer)
returns bigint language plpgsql as $$
declare
  v_next    bigint;
  v_touched timestamptz;
  v_gap     bigint;
  v_top     bigint;
begin
  insert into public.signer_nonces (signer_address, next_nonce) values (p_signer, p_chain_nonce)
  on conflict (signer_address) do nothing;
  select next_nonce, updated_at into v_next, v_touched
  from public.signer_nonces where signer_address = p_signer for update;

  -- Abandoned jobs (nonce reserved, never broadcast, lease expired) give their nonce back.
  -- (RETURNING shows the new row before PG 18, so the old nonce comes from the locked CTE.)
  with abandoned as (
    select a.vault_address, a.chain_mission_id, a.submission_hash, a.nonce
    from public.monad_settlements a
    where a.signer_address = p_signer and a.status = 'pending' and a.tx_hash is null and a.nonce is not null
      and (a.lease_expires_at is null or a.lease_expires_at < now())
    for update
  ), freed as (
    update public.monad_settlements s set nonce = null, updated_at = now()
    from abandoned a
    where s.vault_address = a.vault_address and s.chain_mission_id = a.chain_mission_id
      and s.submission_hash = a.submission_hash
    returning a.nonce as freed_nonce
  )
  insert into public.signer_nonce_gaps (signer_address, nonce)
  select p_signer, freed_nonce from freed on conflict do nothing;

  -- Reconcile, only after the counter was idle for a lease (then nothing is between "reserved" and "broadcast"):
  -- unused nonces no live job holds become gaps; a counter above every held nonce (chain reset, lost rows)
  -- comes down to the chain's pending nonce.
  if v_touched < now() - make_interval(secs => p_idle_ms / 1000.0) then
    select greatest(p_chain_nonce, coalesce(max(s.nonce) + 1, 0)) into v_top
    from public.monad_settlements s
    where s.signer_address = p_signer and s.status = 'pending' and s.nonce is not null
      and (s.tx_hash is not null or s.lease_expires_at >= now());
    if v_next > v_top then
      v_next := v_top;
    end if;
    delete from public.signer_nonce_gaps where signer_address = p_signer and nonce >= v_top;
    if v_top - p_chain_nonce <= 1024 then
      insert into public.signer_nonce_gaps (signer_address, nonce)
      select p_signer, g from generate_series(p_chain_nonce, v_top - 1) as g
      where not exists (
        select 1 from public.monad_settlements s
        where s.signer_address = p_signer and s.status = 'pending' and s.nonce = g
          and (s.tx_hash is not null or s.lease_expires_at >= now()))
      on conflict do nothing;
    end if;
  end if;

  -- Gaps below the chain's pending nonce were filled by some tx: drop them.
  delete from public.signer_nonce_gaps where signer_address = p_signer and nonce < p_chain_nonce;

  select nonce into v_gap from public.signer_nonce_gaps where signer_address = p_signer order by nonce limit 1;
  if v_gap is not null then
    delete from public.signer_nonce_gaps where signer_address = p_signer and nonce = v_gap;
    update public.signer_nonces set next_nonce = v_next, updated_at = now() where signer_address = p_signer;
    return v_gap;
  end if;

  v_next := greatest(v_next, p_chain_nonce);   -- resync upwards when the chain is ahead
  update public.signer_nonces set next_nonce = v_next + 1, updated_at = now() where signer_address = p_signer;
  return v_next;
end $$;

create or replace function public.monad_release_signer_nonce(p_signer text, p_nonce bigint)
returns void language sql as $$
  insert into public.signer_nonce_gaps (signer_address, nonce) values (p_signer, p_nonce) on conflict do nothing
$$;

-- Who holds a nonce: a pending job with a recorded tx (re-broadcastable), a live reservation, or nobody.
create or replace function public.monad_find_nonce_holder(p_signer text, p_nonce bigint)
returns jsonb language sql stable as $$
  select coalesce(
    (select case when s.tx_hash is not null
                 then jsonb_build_object('kind', 'inflight', 'txHash', s.tx_hash, 'rawTx', s.raw_tx)
                 else jsonb_build_object('kind', 'reserved') end
     from public.monad_settlements s
     where s.signer_address = p_signer and s.status = 'pending' and s.nonce = p_nonce
       and (s.tx_hash is not null or s.lease_expires_at >= now())
     order by (s.tx_hash is not null) desc
     limit 1),
    jsonb_build_object('kind', 'none'))
$$;

create or replace function public.monad_resync_signer_nonce(p_signer text, p_chain_nonce bigint)
returns void language plpgsql as $$
begin
  insert into public.signer_nonces (signer_address, next_nonce) values (p_signer, p_chain_nonce)
  on conflict (signer_address) do update set next_nonce = excluded.next_nonce, updated_at = now();
  delete from public.signer_nonce_gaps where signer_address = p_signer and nonce < p_chain_nonce;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Job lifecycle.
create or replace function public.monad_settlement_claim(
  p_vault text, p_mission text, p_hash text, p_contributor text, p_owner text, p_lease_ms integer)
returns jsonb language plpgsql as $$
declare
  r public.monad_settlements;
begin
  insert into public.monad_settlements
    (vault_address, chain_mission_id, submission_hash, contributor_address, status, lease_owner, lease_expires_at)
  values (p_vault, p_mission, p_hash, p_contributor, 'pending', p_owner, now() + make_interval(secs => p_lease_ms / 1000.0))
  on conflict do nothing
  returning * into r;
  if found then
    return jsonb_build_object('claimed', true, 'record', public.monad_settlement_json(r));
  end if;

  select * into r from public.monad_settlements
  where vault_address = p_vault and chain_mission_id = p_mission and submission_hash = p_hash
  for update;

  if r.status = 'failed'
     or (r.status = 'pending' and r.tx_hash is null and (r.lease_expires_at is null or r.lease_expires_at < now())) then
    update public.monad_settlements set
      status = 'pending', lease_owner = p_owner,
      lease_expires_at = now() + make_interval(secs => p_lease_ms / 1000.0),
      nonce = case when r.status = 'failed' then null else r.nonce end,  -- pending: new owner reuses the nonce
      tx_hash = null, raw_tx = null, last_error = null, updated_at = now()
    where vault_address = p_vault and chain_mission_id = p_mission and submission_hash = p_hash
    returning * into r;
    return jsonb_build_object('claimed', true, 'record', public.monad_settlement_json(r));
  end if;

  return jsonb_build_object('claimed', false, 'record', public.monad_settlement_json(r));
end $$;

create or replace function public.monad_settlement_reserve_nonce(
  p_vault text, p_mission text, p_hash text, p_owner text, p_signer text, p_chain_nonce bigint, p_lease_ms integer)
returns bigint language plpgsql as $$
declare
  r       public.monad_settlements;
  v_nonce bigint;
begin
  -- Lock order: signer counter first (monad_allocate_nonce would take it anyway).
  insert into public.signer_nonces (signer_address, next_nonce) values (p_signer, p_chain_nonce)
  on conflict (signer_address) do nothing;
  perform 1 from public.signer_nonces where signer_address = p_signer for update;

  select * into r from public.monad_settlements
  where vault_address = p_vault and chain_mission_id = p_mission and submission_hash = p_hash
  for update;
  if not found or r.status <> 'pending' or r.lease_owner is distinct from p_owner or r.tx_hash is not null then
    return null;   -- lease lost
  end if;

  v_nonce := r.nonce;
  if v_nonce is not null and r.signer_address is distinct from p_signer then
    perform public.monad_release_signer_nonce(r.signer_address, v_nonce);   -- key rotated
    v_nonce := null;
  end if;
  if v_nonce is not null and v_nonce < p_chain_nonce then
    v_nonce := null;   -- consumed on chain by another tx
  end if;
  if v_nonce is null then
    v_nonce := public.monad_allocate_nonce(p_signer, p_chain_nonce, p_lease_ms);   -- our lease is live: sweep skips us
  end if;

  update public.monad_settlements set
    signer_address = p_signer, nonce = v_nonce,
    lease_expires_at = now() + make_interval(secs => p_lease_ms / 1000.0), updated_at = now()
  where vault_address = p_vault and chain_mission_id = p_mission and submission_hash = p_hash;
  return v_nonce;
end $$;

create or replace function public.monad_settlement_record_broadcast(
  p_vault text, p_mission text, p_hash text, p_owner text, p_tx_hash text, p_raw_tx text)
returns boolean language plpgsql as $$
begin
  update public.monad_settlements set
    tx_hash = p_tx_hash, raw_tx = p_raw_tx, attempts = attempts + 1, updated_at = now()
  where vault_address = p_vault and chain_mission_id = p_mission and submission_hash = p_hash
    and status = 'pending' and lease_owner = p_owner and tx_hash is null and nonce is not null;
  return found;
end $$;

create or replace function public.monad_settlement_release_nonce(
  p_vault text, p_mission text, p_hash text, p_owner text, p_reason text)
returns void language plpgsql as $$
declare
  r public.monad_settlements;
begin
  select * into r from public.monad_settlements
  where vault_address = p_vault and chain_mission_id = p_mission and submission_hash = p_hash
  for update;
  if not found or r.lease_owner is distinct from p_owner or r.status <> 'pending' then
    return;
  end if;
  if r.nonce is not null and r.signer_address is not null then
    perform public.monad_release_signer_nonce(r.signer_address, r.nonce);
  end if;
  update public.monad_settlements set
    status = 'failed', nonce = null, tx_hash = null, raw_tx = null,
    lease_owner = null, lease_expires_at = null, last_error = p_reason, updated_at = now()
  where vault_address = p_vault and chain_mission_id = p_mission and submission_hash = p_hash;
end $$;

create or replace function public.monad_settlement_reset_attempt(
  p_vault text, p_mission text, p_hash text, p_expected_tx_hash text, p_owner text, p_lease_ms integer,
  p_max_attempts integer)
returns boolean language plpgsql as $$
begin
  update public.monad_settlements set
    tx_hash = null, raw_tx = null, nonce = null, lease_owner = p_owner,
    lease_expires_at = now() + make_interval(secs => p_lease_ms / 1000.0), updated_at = now()
  where vault_address = p_vault and chain_mission_id = p_mission and submission_hash = p_hash
    and status = 'pending' and tx_hash = p_expected_tx_hash and attempts < p_max_attempts;
  return found;
end $$;

create or replace function public.monad_settlement_mark_settled(
  p_vault text, p_mission text, p_hash text, p_contributor text, p_tx_hash text, p_amount_wei text)
returns void language sql as $$
  insert into public.monad_settlements
    (vault_address, chain_mission_id, submission_hash, contributor_address, status, tx_hash, amount_wei)
  values (p_vault, p_mission, p_hash, p_contributor, 'settled', p_tx_hash, p_amount_wei)
  on conflict (vault_address, chain_mission_id, submission_hash) do update set
    status = 'settled', tx_hash = coalesce(excluded.tx_hash, public.monad_settlements.tx_hash),
    raw_tx = null, amount_wei = excluded.amount_wei, lease_owner = null, lease_expires_at = null,
    last_error = null, updated_at = now()
$$;

create or replace function public.monad_settlement_mark_failed(
  p_vault text, p_mission text, p_hash text, p_tx_hash text, p_reason text)
returns void language plpgsql as $$
declare
  r public.monad_settlements;
  v_unused boolean;
begin
  select * into r from public.monad_settlements
  where vault_address = p_vault and chain_mission_id = p_mission and submission_hash = p_hash
  for update;
  if not found or r.status = 'settled' then
    return;
  end if;
  v_unused := p_tx_hash is null and r.nonce is not null and r.signer_address is not null;
  if v_unused then
    perform public.monad_release_signer_nonce(r.signer_address, r.nonce);
  end if;
  update public.monad_settlements set
    status = 'failed', tx_hash = p_tx_hash, raw_tx = null,
    nonce = case when v_unused then null else r.nonce end,
    lease_owner = null, lease_expires_at = null, last_error = p_reason, updated_at = now()
  where vault_address = p_vault and chain_mission_id = p_mission and submission_hash = p_hash;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Only the server (service role) may call these.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'monad_settlement_json(public.monad_settlements)',
    'monad_settlement_get(text,text,text)',
    'monad_allocate_nonce(text,bigint,integer)',
    'monad_find_nonce_holder(text,bigint)',
    'monad_release_signer_nonce(text,bigint)',
    'monad_resync_signer_nonce(text,bigint)',
    'monad_settlement_claim(text,text,text,text,text,integer)',
    'monad_settlement_reserve_nonce(text,text,text,text,text,bigint,integer)',
    'monad_settlement_record_broadcast(text,text,text,text,text,text)',
    'monad_settlement_release_nonce(text,text,text,text,text)',
    'monad_settlement_reset_attempt(text,text,text,text,text,integer,integer)',
    'monad_settlement_mark_settled(text,text,text,text,text,text)',
    'monad_settlement_mark_failed(text,text,text,text,text)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function public.%s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function public.%s from authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
  -- RLS without policies already blocks them; revoke the Supabase default table grants as well.
  foreach fn in array array['monad_settlements', 'signer_nonces', 'signer_nonce_gaps'] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table public.%I from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table public.%I from authenticated', fn);
    end if;
  end loop;
end $$;
