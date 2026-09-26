-- M5 Part A: settlement reconciliation bookkeeping + atomic reconcile RPC.
-- Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
--
-- Additive only — does not rewrite 0001-0007.

alter table public.settlements
  add column if not exists reconciliation_status text not null default 'none'
    check (reconciliation_status in ('none', 'required', 'confirmed_onchain', 'not_found_onchain', 'unknown')),
  add column if not exists last_reconciled_at timestamptz,
  add column if not exists reconciliation_attempts integer not null default 0
    check (reconciliation_attempts >= 0),
  add column if not exists reconciliation_error text;

-- =========================================================================
-- reconcile_settlement_confirmed
-- =========================================================================
-- Like M4's finalize_settlement_confirmed, but callable from a broader set
-- of starting states ('broadcasting' OR 'failed', not just 'broadcasting')
-- since reconciliation exists specifically to recover CASE 1 (stuck
-- broadcasting) and CASE 2 (marked failed, but the chain actually shows it
-- succeeded). Idempotent: already-confirmed just returns as-is.
create or replace function public.reconcile_settlement_confirmed(
  p_submission_id uuid,
  p_tx_hash text,
  p_amount_wei text
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

  if v_settlement.status not in ('broadcasting', 'failed') then
    raise exception 'SETTLEMENT_INCONSISTENT_STATE';
  end if;

  select * into v_submission from public.submissions where id = p_submission_id for update;
  if not found or v_submission.status not in ('accepted', 'paid') then
    raise exception 'SETTLEMENT_INCONSISTENT_STATE';
  end if;

  update public.settlements
    set status = 'confirmed',
        tx_hash = p_tx_hash,
        amount_wei = p_amount_wei,
        settled_at = coalesce(settled_at, now()),
        updated_at = now(),
        error_code = null,
        reconciliation_status = 'confirmed_onchain',
        last_reconciled_at = now(),
        reconciliation_attempts = reconciliation_attempts + 1,
        reconciliation_error = null
    where id = v_settlement.id
    returning * into v_settlement;

  update public.submissions
    set status = 'paid', tx_hash = p_tx_hash
    where id = p_submission_id and status <> 'paid';

  return v_settlement;
end;
$$;

grant execute on function public.reconcile_settlement_confirmed(uuid, text, text) to service_role;
