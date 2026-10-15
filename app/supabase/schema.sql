-- The Rat Race: database schema for Supabase.
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.

-- Every map item (company, role, application, document, contact, interview, event)
-- is one row. `col` says which kind it is; `data` holds its fields as JSON.
create table if not exists public.records (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  col        text not null check (col in ('companies','roles','applications','documents','people','interviews','events')),
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists records_user_idx on public.records (user_id);

-- Keep updated_at current.
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before update on public.records for each row execute function public.touch_updated_at();

-- Table privileges. Newer Supabase projects don't grant these automatically, and RLS
-- only narrows access a role already has. Signed-out visitors (anon) get nothing.
grant select, insert, update, delete on public.records to authenticated;
revoke all on public.records from anon;
revoke truncate, trigger, references on public.records from authenticated;

-- Row-level security: each signed-in person sees and changes only their own rows.
alter table public.records enable row level security;
drop policy if exists "own rows: select" on public.records;
drop policy if exists "own rows: insert" on public.records;
drop policy if exists "own rows: update" on public.records;
drop policy if exists "own rows: delete" on public.records;
create policy "own rows: select" on public.records for select to authenticated using (user_id = auth.uid());
create policy "own rows: insert" on public.records for insert to authenticated with check (user_id = auth.uid());
create policy "own rows: update" on public.records for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows: delete" on public.records for delete to authenticated using (user_id = auth.uid());

-- Cap rows per person so one account can't fill the database.
create or replace function public.limit_records() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.records where user_id = new.user_id) >= 5000 then
    raise exception 'Map is full (5000 items). Delete old events to make room.';
  end if;
  return new;
end $$;
drop trigger if exists records_limit on public.records;
create trigger records_limit before insert on public.records for each row execute function public.limit_records();

-- Live updates across a person's open tabs and devices.
do $$ begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null; end $$;

-- File storage for resumes and cover letters: a private bucket where each person
-- can only touch files inside a folder named after their user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 20971520,
        array['application/pdf','image/png','image/jpeg','image/webp','image/gif','text/plain','text/markdown'])
on conflict (id) do nothing;

drop policy if exists "own files: select" on storage.objects;
drop policy if exists "own files: insert" on storage.objects;
drop policy if exists "own files: update" on storage.objects;
drop policy if exists "own files: delete" on storage.objects;
create policy "own files: select" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files: insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files: update" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
