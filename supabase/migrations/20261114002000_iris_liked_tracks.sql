-- Iris — cloud "Titres likés".
--
-- One row per user and track. `track_data` mirrors the playlist_tracks JSONB
-- payload so a liked track can be rendered and played without touching the
-- catalog again. Every read/write is scoped to auth.uid() by RLS.

create table if not exists public.liked_tracks (
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null,
  track_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

create index if not exists liked_tracks_user_created_idx
  on public.liked_tracks (user_id, created_at desc);

alter table public.liked_tracks enable row level security;

drop policy if exists "liked_tracks_select_own" on public.liked_tracks;
create policy "liked_tracks_select_own"
  on public.liked_tracks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "liked_tracks_insert_own" on public.liked_tracks;
create policy "liked_tracks_insert_own"
  on public.liked_tracks
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "liked_tracks_update_own" on public.liked_tracks;
create policy "liked_tracks_update_own"
  on public.liked_tracks
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "liked_tracks_delete_own" on public.liked_tracks;
create policy "liked_tracks_delete_own"
  on public.liked_tracks
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Realtime keeps the heart in sync across windows/devices.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'liked_tracks'
     )
  then
    alter publication supabase_realtime add table public.liked_tracks;
  end if;
end
$$;
