-- M4: settlement orchestration and payout persistence.
-- Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
--
-- Additive only — does not rewrite 0001-0006.
--
-- Money columns (amount_mon, amount_wei, block_number) are `text`, not
-- numeric/bigint. This is a deliberate choice: M0-M3 stored reward_mon as
-- numeric(38,18) and read it back through supabase-js/PostgREST, which
-- (unlike the raw pg driver) does NOT stringify numeric/bigint — it was
-- only discovered in M4 that this had been silently returning reward_mon
-- as a lossy JSON number the whole time (see lib/supabase/missions.ts's
-- new ::text casts). Using `text` here for settlement money fields removes
-- that entire class of bug for this table permanently: there is no cast to
-- forget, ever.

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  mission_id uuid not null references public.missions (id),
  chain_mission_id text not null,
  contributor_address text not null,
  -- The submission's media_hash — the on-chain proof hash. Named
  -- submission_hash here to match the settlement gateway's vocabulary.
  submission_hash text not null,
  amount_mon text not null,
  amount_wei text not null,
  status text not null default 'pending'
    check (status in ('pending', 'broadcasting', 'confirmed', 'failed')),
  tx_hash text,
  block_number text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists settlements_mission_id_idx on public.settlements (mission_id);
create index if not exists settlements_status_idx on public.settlements (status);
create unique index if not exists settlements_tx_hash_key
  on public.settlements (tx_hash)
  where tx_hash is not null;

alter table public.settlements enable row level security;

grant select, insert, update, delete on table public.settlements to service_role;

-- =========================================================================
-- claim_settlement_for_broadcast
-- =========================================================================
-- Atomically creates (if missing) and claims the right to call the
-- settlement gateway for a submission. Row-locks both the submission and
-- the settlement row so concurrent calls serialize: only one caller gets
-- claimed = true and should actually call the gateway; the rest observe
-- 'broadcasting' (already in progress) or 'confirmed' (already done) and
-- back off without a second payout attempt.
create or replace function public.claim_settlement_for_broadcast(
  p_submission_id uuid,
  p_mission_id uuid,
  p_chain_mission_id text,
  p_contributor_address text,
  p_submission_hash text,
  p_amount_mon text,
  p_amount_wei text,
  out settlement public.settlements,
  out claimed boolean
) returns record
language plpgsql
as $$
declare
  v_submission public.submissions;
  v_settlement public.settlements;
begin
  select * into v_submission from public.submissions where id = p_submission_id for update;
  if not found then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;
  if v_submission.status <> 'accepted' then
    raise exception 'SUBMISSION_NOT_ACCEPTED';
  end if;

  insert into public.settlements (
    submission_id, mission_id, chain_mission_id, contributor_address,
    submission_hash, amount_mon, amount_wei, status
  ) values (
    p_submission_id, p_mission_id, p_chain_mission_id, p_contributor_address,
    p_submission_hash, p_amount_mon, p_amount_wei, 'pending'
  )
  on conflict (submission_id) do nothing;

  select * into v_settlement from public.settlements where submission_id = p_submission_id for update;

  if v_settlement.status in ('confirmed', 'broadcasting') then
    settlement := v_settlement;
    claimed := false;
    return;
  end if;

  -- status is 'pending' or 'failed' (explicit retry) -> claim it.
  update public.settlements
    set status = 'broadcasting', updated_at = now()
    where id = v_settlement.id
    returning * into v_settlement;

  settlement := v_settlement;
  claimed := true;
  return;
end;
$$;

grant execute on function public.claim_settlement_for_broadcast(
  uuid, uuid, text, text, text, text, text
) to service_role;

-- =========================================================================
-- finalize_settlement_confirmed
-- =========================================================================
-- Atomically finalizes a successful gateway call: marks the settlement
-- confirmed with the real tx_hash/amount_wei/block_number the gateway
-- returned, and marks the submission paid — in one transaction, so the two
-- can never disagree. Re-checks both rows' state before writing anything,
-- so a stray/duplicate call never double-applies.
create or replace function public.finalize_settlement_confirmed(
  p_submission_id uuid,
  p_tx_hash text,
  p_amount_wei text,
  p_block_number text
) returns public.settlements
language plpgsql
as $$
declare
  v_settlement public.settlements;
  v_submission public.submissions;
begin
  select * into v_settlement from public.settlements where submission_id = p_submission_id for update;
  if not found then
    raise exception 'SETTLEMENT_NOT_FOUND';
  end if;

  if v_settlement.status = 'confirmed' then
    return v_settlement;
  end if;

  if v_settlement.status <> 'broadcasting' then
    raise exception 'SETTLEMENT_INCONSISTENT_STATE';
  end if;

  select * into v_submission from public.submissions where id = p_submission_id for update;
  if not found or v_submission.status <> 'accepted' then
    raise exception 'SETTLEMENT_INCONSISTENT_STATE';
  end if;

  update public.settlements
    set status = 'confirmed',
        tx_hash = p_tx_hash,
        amount_wei = p_amount_wei,
        block_number = p_block_number,
        settled_at = now(),
        updated_at = now(),
        error_code = null
    where id = v_settlement.id
    returning * into v_settlement;

  update public.submissions
    set status = 'paid', tx_hash = p_tx_hash
    where id = p_submission_id;

  return v_settlement;
end;
$$;

grant execute on function public.finalize_settlement_confirmed(uuid, text, text, text) to service_role;
