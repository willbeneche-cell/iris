import { toClientTrack } from "@/shared/api/track";
import { clientCatalog } from "@/shared/api/clientCatalog";
import { toPlaylistTrackData } from "@/features/playlists/types";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { requireSupabaseClient } from "@/shared/supabase/client";
import type {
  LikedTrackRow,
  PlaylistTrackData,
} from "@/shared/supabase/database.types";
import type { Track } from "@/shared/types";

/**
 * Cloud transport for "Titres likés" (public.liked_tracks).
 *
 * Rows are scoped to `auth.uid()` by RLS, so every call passes the signed-in
 * user id and never trusts a client-supplied owner from elsewhere.
 */

const COLUMNS = "user_id, track_id, track_data, created_at";
const PAGE_SIZE = 500;

export function likedRowToTrack(row: LikedTrackRow): Track {
  const data = row.track_data ?? ({} as PlaylistTrackData);
  return {
    id: row.track_id,
    title: data.title ?? "",
    artists: data.artist ?? "",
    coverUrl: data.coverUrl ?? "",
    durationMs: data.durationMs ?? 0,
    playCount: 0,
    ...(data.explicit ? { explicit: true } : {}),
    ...(data.album ? { album: data.album } : {}),
    addedAt: row.created_at,
  };
}

/**
 * `liked_tracks.track_data` needs metadata the server cannot look up anymore.
 * The playing track is authoritative, then the catalog snapshot.
 */
async function resolveTrackData(trackId: string): Promise<PlaylistTrackData> {
  const current = usePlayerStore.getState().currentTrack;
  if (current?.id === trackId) return toPlaylistTrackData(current);

  const snapshot = await clientCatalog.resolveSnapshot(trackId);
  if (snapshot) return toPlaylistTrackData(toClientTrack(snapshot));

  throw new Error("Track metadata is unavailable");
}

export async function listLikedTracks(userId: string): Promise<Track[]> {
  const supabase = requireSupabaseClient();
  const tracks: Track[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("liked_tracks")
      .select(COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as LikedTrackRow[];
    tracks.push(...rows.map(likedRowToTrack));
    if (rows.length < PAGE_SIZE) break;
  }

  return tracks;
}

export async function likeTrack(
  userId: string,
  trackId: string,
): Promise<void> {
  const supabase = requireSupabaseClient();
  const trackData = await resolveTrackData(trackId);

  const { error } = await supabase
    .from("liked_tracks")
    .upsert(
      { user_id: userId, track_id: trackId, track_data: trackData },
      { onConflict: "user_id,track_id" },
    );
  if (error) throw new Error(error.message);
}

export async function unlikeTrack(
  userId: string,
  trackId: string,
): Promise<void> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase
    .from("liked_tracks")
    .delete()
    .eq("user_id", userId)
    .eq("track_id", trackId);
  if (error) throw new Error(error.message);
}
