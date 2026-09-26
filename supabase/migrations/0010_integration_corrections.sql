-- Integration corrections: withdrawal rate limiting.
-- Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
--
-- Additive only — does not rewrite 0001-0009.
--
-- DB-backed (not in-memory) so the limit survives a server restart and
-- holds across multiple server instances — important here because the
-- thing being protected is the verifier's own gas spend on
-- withdrawForContributor, not just API abuse.

create table if not exists public.rate_limit_windows (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.rate_limit_windows enable row level security;
grant select, insert, update, delete on table public.rate_limit_windows to service_role;

-- Atomically checks and increments a fixed-window rate limit for an
-- arbitrary key (e.g. "contributor:0x..." or "ip:1.2.3.4"), row-locked so
-- concurrent requests for the same key can't both slip through.
create or replace function public.check_and_increment_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_max_attempts integer,
  out allowed boolean,
  out attempt_count integer,
  out retry_after_seconds integer
) returns record
language plpgsql
as $$
declare
  v_row public.rate_limit_windows;
  v_now timestamptz := now();
begin
  insert into public.rate_limit_windows (rate_key, window_started_at, attempt_count)
  values (p_key, v_now, 0)
  on conflict (rate_key) do nothing;

  select * into v_row from public.rate_limit_windows where rate_key = p_key for update;

  if v_now - v_row.window_started_at > make_interval(secs => p_window_seconds) then
    update public.rate_limit_windows
      set window_started_at = v_now, attempt_count = 1, updated_at = v_now
      where rate_key = p_key
      returning * into v_row;

    allowed := true;
    attempt_count := v_row.attempt_count;
    retry_after_seconds := 0;
    return;
  end if;

  if v_row.attempt_count >= p_max_attempts then
    allowed := false;
    attempt_count := v_row.attempt_count;
    retry_after_seconds := greatest(
      0,
      ceil(extract(epoch from (v_row.window_started_at + make_interval(secs => p_window_seconds) - v_now)))::integer
    );
    return;
  end if;

  update public.rate_limit_windows
    set attempt_count = attempt_count + 1, updated_at = v_now
    where rate_key = p_key
    returning * into v_row;

  allowed := true;
  attempt_count := v_row.attempt_count;
  retry_after_seconds := 0;
  return;
end;
$$;

grant execute on function public.check_and_increment_rate_limit(text, integer, integer) to service_role;
