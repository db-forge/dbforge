grant usage on schema public to service_role;

grant select, insert, update, delete
on table public.missions
to service_role;

grant select, insert, update, delete
on table public.submissions
to service_role;

grant select, insert, update, delete
on table public.verification_results
to service_role;

