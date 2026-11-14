-- =============================================================================
-- Iris — schéma initial
-- Tables : profiles, playlists, playlist_tracks
-- RLS activé partout, storage avatars/playlist-covers, realtime.
-- Idempotent : peut être rejoué (drop policy / if not exists).
-- =============================================================================

-- 0. Extensions ---------------------------------------------------------------
create extension if not exists pgcrypto;

-- 1. profiles ----------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  avatar_url text,
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (char_length(username) between 3 and 30),
  constraint profiles_username_charset check (username ~ '^[A-Za-z0-9_.-]+$')
);

-- unicité insensible à la casse
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- 2. playlists ---------------------------------------------------------------
create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  cover_url text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  constraint playlists_name_length check (char_length(name) between 1 and 120),
  constraint playlists_description_length
    check (description is null or char_length(description) <= 1000)
);

create index if not exists playlists_user_id_created_at_idx
  on public.playlists (user_id, created_at desc);

create index if not exists playlists_public_created_at_idx
  on public.playlists (created_at desc)
  where is_public;

-- 3. playlist_tracks ---------------------------------------------------------
create table if not exists public.playlist_tracks (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null
    references public.playlists (id) on delete cascade,
  -- identifiant catalogue (ex. video id YouTube, id SoundCloud, id local)
  track_id text not null,
  -- { title, artist, duration, audioUrl, coverUrl, source }
  track_data jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  constraint playlist_tracks_track_id_length
    check (char_length(track_id) between 1 and 200),
  constraint playlist_tracks_track_data_object
    check (jsonb_typeof(track_data) = 'object'),
  constraint playlist_tracks_position_non_negative check (position >= 0),
  constraint playlist_tracks_unique_track unique (playlist_id, track_id)
);

create index if not exists playlist_tracks_playlist_position_idx
  on public.playlist_tracks (playlist_id, position, added_at);

-- 4. Horodatage --------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- 5. Profil automatique à l'inscription --------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_name text;
  base_name text;
  candidate text;
  suffix integer := 0;
begin
  raw_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), '')
  );

  base_name := lower(
    regexp_replace(coalesce(raw_name, 'iris'), '[^A-Za-z0-9_.-]', '', 'g')
  );

  if char_length(base_name) < 3 then
    base_name := 'iris_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  base_name := left(base_name, 24);
  candidate := base_name;

  while exists (
    select 1 from public.profiles p where lower(p.username) = candidate
  ) loop
    suffix := suffix + 1;
    candidate := left(base_name, 24) || '_' || suffix::text;
  end loop;

  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    candidate,
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 6. Helpers de permissions --------------------------------------------------
-- SECURITY DEFINER : évite la récursion RLS quand playlist_tracks interroge
-- playlists, et centralise la règle « propriétaire » / « lisible ».
create or replace function public.owns_playlist(p_playlist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.playlists p
    where p.id = p_playlist_id
      and p.user_id = auth.uid()
  );
$$;

create or replace function public.can_read_playlist(p_playlist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.playlists p
    where p.id = p_playlist_id
      and (p.is_public or p.user_id = auth.uid())
  );
$$;

revoke all on function public.owns_playlist(uuid) from public;
revoke all on function public.can_read_playlist(uuid) from public;
grant execute on function public.owns_playlist(uuid) to authenticated;
grant execute on function public.can_read_playlist(uuid) to anon, authenticated;

-- 7. Row Level Security ------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;

-- profiles
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- playlists
drop policy if exists "playlists_select_public_or_own" on public.playlists;
create policy "playlists_select_public_or_own"
  on public.playlists
  for select
  to anon, authenticated
  using (is_public or (select auth.uid()) = user_id);

drop policy if exists "playlists_insert_own" on public.playlists;
create policy "playlists_insert_own"
  on public.playlists
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "playlists_update_own" on public.playlists;
create policy "playlists_update_own"
  on public.playlists
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "playlists_delete_own" on public.playlists;
create policy "playlists_delete_own"
  on public.playlists
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- playlist_tracks
drop policy if exists "playlist_tracks_select_readable" on public.playlist_tracks;
create policy "playlist_tracks_select_readable"
  on public.playlist_tracks
  for select
  to anon, authenticated
  using (public.can_read_playlist(playlist_id));

drop policy if exists "playlist_tracks_insert_owner" on public.playlist_tracks;
create policy "playlist_tracks_insert_owner"
  on public.playlist_tracks
  for insert
  to authenticated
  with check (public.owns_playlist(playlist_id));

drop policy if exists "playlist_tracks_update_owner" on public.playlist_tracks;
create policy "playlist_tracks_update_owner"
  on public.playlist_tracks
  for update
  to authenticated
  using (public.owns_playlist(playlist_id))
  with check (public.owns_playlist(playlist_id));

drop policy if exists "playlist_tracks_delete_owner" on public.playlist_tracks;
create policy "playlist_tracks_delete_owner"
  on public.playlist_tracks
  for delete
  to authenticated
  using (public.owns_playlist(playlist_id));

-- 8. Privilèges (RLS filtre ensuite les lignes) ------------------------------
grant usage on schema public to anon, authenticated;

grant select on public.profiles to authenticated;
grant insert, update on public.profiles to authenticated;

grant select on public.playlists to anon, authenticated;
grant insert, update, delete on public.playlists to authenticated;

grant select on public.playlist_tracks to anon, authenticated;
grant insert, update, delete on public.playlist_tracks to authenticated;

-- 9. Storage : avatars + pochettes de playlists ------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152,
    array['image/png', 'image/jpeg', 'image/webp', 'image/avif']),
  ('playlist-covers', 'playlist-covers', true, 5242880,
    array['image/png', 'image/jpeg', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- lecture publique des deux buckets
drop policy if exists "iris_storage_read_avatars" on storage.objects;
create policy "iris_storage_read_avatars"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "iris_storage_read_playlist_covers" on storage.objects;
create policy "iris_storage_read_playlist_covers"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'playlist-covers');

-- écriture limitée au dossier <user_id>/…
drop policy if exists "iris_storage_insert_own_files" on storage.objects;
create policy "iris_storage_insert_own_files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in ('avatars', 'playlist-covers')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "iris_storage_update_own_files" on storage.objects;
create policy "iris_storage_update_own_files"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id in ('avatars', 'playlist-covers')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('avatars', 'playlist-covers')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "iris_storage_delete_own_files" on storage.objects;
create policy "iris_storage_delete_own_files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in ('avatars', 'playlist-covers')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 10. Realtime ---------------------------------------------------------------
alter table public.playlists replica identity full;
alter table public.playlist_tracks replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.playlists;
    exception when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public.playlist_tracks;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;
