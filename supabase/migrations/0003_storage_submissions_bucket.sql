-- M1: private storage bucket for submission media.
-- Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
--
-- The bucket is created with public = false. storage.objects already has
-- Row Level Security enabled by default in Supabase, and we intentionally
-- add NO policies for the anon/authenticated roles here — that means
-- anon/authenticated access is denied by default (both read and write).
-- All uploads/downloads go through the server-side service role client
-- (lib/supabase/storage.ts), which bypasses RLS. Do not add a public
-- SELECT/INSERT policy for this bucket.

insert into storage.buckets (id, name, public)
values ('dbforge-submissions', 'dbforge-submissions', false)
on conflict (id) do nothing;
