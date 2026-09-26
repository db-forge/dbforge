-- M3: AI semantic verification — manual_review status/decision, AI audit
-- fields, and an atomic acceptance RPC.
-- Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
--
-- Additive only — does not rewrite 0001-0005. The status/final_decision
-- check constraints from 0001 were created inline (unnamed), so their
-- actual generated names are looked up dynamically here rather than
-- assumed, before being replaced with a version that also allows
-- 'manual_review'.

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.submissions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';
  if con_name is not null then
    execute format('alter table public.submissions drop constraint %I', con_name);
  end if;
end $$;

alter table public.submissions
  add constraint submissions_status_check
  check (status in ('uploaded', 'verifying', 'accepted', 'rejected', 'paid', 'manual_review'));

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.verification_results'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%final_decision%';
  if con_name is not null then
    execute format('alter table public.verification_results drop constraint %I', con_name);
  end if;
end $$;

alter table public.verification_results
  add constraint verification_results_final_decision_check
  check (final_decision in ('accepted', 'rejected', 'pending', 'manual_review'));

-- AI audit fields. The full validated structured model result is stored in
-- ai_result for auditability — never raw auth headers or media bytes.
alter table public.verification_results
  add column if not exists ai_provider text,
  add column if not exists ai_model text,
  add column if not exists ai_result jsonb,
  add column if not exists semantic_score numeric(5, 4)
    check (semantic_score >= 0 and semantic_score <= 1),
  add column if not exists criteria_version text,
  add column if not exists ai_started_at timestamptz,
  add column if not exists ai_completed_at timestamptz;

-- Atomic, race-safe acceptance. Verifies mission is active, has remaining
-- capacity, and the submission is still in an eligible state, then
-- increments accepted_count and marks the submission accepted — all inside
-- one transaction with row locks, so two concurrent accepts can never both
-- succeed past capacity and accepted_count can never drift from reality.
-- Raises a plain-text exception (matched by message in
-- lib/supabase/acceptance.ts) for every expected conflict instead of
-- silently doing nothing, so the caller can tell exactly what happened.
create or replace function public.accept_submission(
  p_submission_id uuid,
  p_expected_statuses text[]
) returns public.submissions
language plpgsql
as $$
declare
  v_submission public.submissions;
  v_mission public.missions;
begin
  select * into v_submission from public.submissions where id = p_submission_id for update;
  if not found then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;

  if not (v_submission.status = any(p_expected_statuses)) then
    raise exception 'SUBMISSION_NOT_ELIGIBLE';
  end if;

  select * into v_mission from public.missions where id = v_submission.mission_id for update;
  if not found then
    raise exception 'MISSION_NOT_FOUND';
  end if;

  if v_mission.status <> 'active' then
    raise exception 'MISSION_NOT_ACTIVE';
  end if;

  if v_mission.accepted_count >= v_mission.target_count then
    raise exception 'MISSION_TARGET_REACHED';
  end if;

  update public.missions
    set accepted_count = accepted_count + 1
    where id = v_mission.id;

  update public.submissions
    set status = 'accepted'
    where id = v_submission.id
    returning * into v_submission;

  return v_submission;
end;
$$;

grant execute on function public.accept_submission(uuid, text[]) to service_role;
