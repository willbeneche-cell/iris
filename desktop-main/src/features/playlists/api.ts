import type { Track } from "@/shared/types";
import { requireSupabaseClient } from "@/shared/supabase/client";
import type {
  PlaylistRow,
  PlaylistTrackRow,
} from "@/shared/supabase/database.types";
import {
  toPlaylistTrackData,
  type CreatePlaylistInput,
  type Playlist,
  type PlaylistTrack,
  type UpdatePlaylistInput,
} from "./types";

const PLAYLIST_COLUMNS =
  "id, user_id, name, description, cover_url, is_public, created_at";
const TRACK_COLUMNS =
  "id, playlist_id, track_id, track_data, position, added_at";
const BULK_INSERT_SIZE = 100;

export function mapPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    coverUrl: row.cover_url,
    isPublic: row.is_public,
    createdAt: row.created_at,
  };
}

export function mapPlaylistTrack(row: PlaylistTrackRow): PlaylistTrack {
  return {
    rowId: row.id,
    playlistId: row.playlist_id,
    trackId: row.track_id,
    data: row.track_data,
    position: row.position,
    addedAt: row.added_at,
  };
}

function raise(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function listPlaylists(userId: string): Promise<Playlist[]> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("playlists")
    .select(PLAYLIST_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  raise(error);
  return ((data ?? []) as PlaylistRow[]).map(mapPlaylist);
}

export async function getPlaylist(
  playlistId: string,
): Promise<Playlist | null> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("playlists")
    .select(PLAYLIST_COLUMNS)
    .eq("id", playlistId)
    .maybeSingle();
  raise(error);
  return data ? mapPlaylist(data as PlaylistRow) : null;
}

export async function createPlaylist(
  userId: string,
  input: CreatePlaylistInput,
): Promise<Playlist> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("playlists")
    .insert({
      user_id: userId,
      name: input.name.trim(),
      description: input.description ?? null,
      cover_url: input.coverUrl ?? null,
      is_public: input.isPublic ?? false,
    })
    .select(PLAYLIST_COLUMNS)
    .single();
  raise(error);
  if (!data) throw new Error("Empty response from Supabase.");
  return mapPlaylist(data as PlaylistRow);
}

export async function updatePlaylist(
  playlistId: string,
  patch: UpdatePlaylistInput,
): Promise<Playlist> {
  const supabase = requireSupabaseClient();
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name.trim();
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.coverUrl !== undefined) payload.cover_url = patch.coverUrl;
  if (patch.isPublic !== undefined) payload.is_public = patch.isPublic;
  if (Object.keys(payload).length === 0) {
    const current = await getPlaylist(playlistId);
    if (!current) throw new Error("Playlist not found.");
    return current;
  }

  const { data, error } = await supabase
    .from("playlists")
    .update(payload)
    .eq("id", playlistId)
    .select(PLAYLIST_COLUMNS)
    .single();
  raise(error);
  if (!data) throw new Error("Empty response from Supabase.");
  return mapPlaylist(data as PlaylistRow);
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase
    .from("playlists")
    .delete()
    .eq("id", playlistId);
  raise(error);
}

export async function listPlaylistTracks(
  playlistId: string,
): Promise<PlaylistTrack[]> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("playlist_tracks")
    .select(TRACK_COLUMNS)
    .eq("playlist_id", playlistId)
    .order("position", { ascending: true })
    .order("added_at", { ascending: true });
  raise(error);
  return ((data ?? []) as PlaylistTrackRow[]).map(mapPlaylistTrack);
}

/**
 * Appends a track at the end of the playlist. Idempotent: adding a track that
 * is already there leaves its position untouched (unique playlist_id/track_id).
 */
export async function addTrackToPlaylist(
  playlistId: string,
  track: Track,
): Promise<PlaylistTrack | null> {
  const supabase = requireSupabaseClient();

  const { data: last, error: lastError } = await supabase
    .from("playlist_tracks")
    .select("position")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  raise(lastError);

  const position = typeof last?.position === "number" ? last.position + 1 : 0;

  const { data, error } = await supabase
    .from("playlist_tracks")
    .upsert(
      {
        playlist_id: playlistId,
        track_id: track.id,
        track_data: toPlaylistTrackData(track),
        position,
      },
      { onConflict: "playlist_id,track_id", ignoreDuplicates: true },
    )
    .select(TRACK_COLUMNS)
    .maybeSingle();
  raise(error);
  return data ? mapPlaylistTrack(data as PlaylistTrackRow) : null;
}

/**
 * Bulk append used by the import pipeline: one read for the current position
 * then chunked upserts instead of a round-trip per track.
 */
export async function addTracksToPlaylist(
  playlistId: string,
  tracks: Track[],
): Promise<number> {
  const unique = [
    ...new Map(tracks.map((track) => [track.id, track] as const)).values(),
  ];
  if (unique.length === 0) return 0;

  const supabase = requireSupabaseClient();
  const { data: last, error: lastError } = await supabase
    .from("playlist_tracks")
    .select("position")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  raise(lastError);

  const start = typeof last?.position === "number" ? last.position + 1 : 0;
  let saved = 0;

  for (let index = 0; index < unique.length; index += BULK_INSERT_SIZE) {
    const chunk = unique.slice(index, index + BULK_INSERT_SIZE);
    const rows = chunk.map((track, offset) => ({
      playlist_id: playlistId,
      track_id: track.id,
      track_data: toPlaylistTrackData(track),
      position: start + index + offset,
    }));
    const { data, error } = await supabase
      .from("playlist_tracks")
      .upsert(rows, {
        onConflict: "playlist_id,track_id",
        ignoreDuplicates: true,
      })
      .select("id");
    raise(error);
    saved += data?.length ?? 0;
  }

  return saved;
}

export async function removeTrackFromPlaylist(rowId: string): Promise<void> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase
    .from("playlist_tracks")
    .delete()
    .eq("id", rowId);
  raise(error);
}

/** Persists a new order: `orderedRowIds` are `playlist_tracks.id` values. */
export async function reorderPlaylistTracks(
  playlistId: string,
  orderedRowIds: string[],
): Promise<void> {
  const supabase = requireSupabaseClient();
  const results = await Promise.all(
    orderedRowIds.map((rowId, index) =>
      supabase
        .from("playlist_tracks")
        .update({ position: index })
        .eq("id", rowId)
        .eq("playlist_id", playlistId),
    ),
  );
  for (const result of results) raise(result.error);
}
