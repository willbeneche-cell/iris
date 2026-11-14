import { toClientTrack } from "@/shared/api/track";
import type { Track } from "@/shared/contracts";
import { useSupabaseAuthStore } from "@/features/auth/hooks/useAuth";
import {
  addTracksToPlaylist,
  createPlaylist,
} from "@/features/playlists/api";

export interface FinalizedPlaylist {
  playlistId: string;
  saved: number;
}

function uniqueTracks(tracks: Track[]): Track[] {
  return [
    ...new Map(
      tracks
        .filter((track) => Boolean(track?.id))
        .map((track) => [track.id, track] as const),
    ).values(),
  ];
}

/**
 * Import used to write to the legacy Liner playlist API. It now creates the
 * playlist in Supabase and bulk-inserts the imported tracks in one pass, so the
 * new playlist shows up in `usePlaylists` (and its realtime channel) at once.
 */
export async function finalizeImportedPlaylist(
  title: string,
  description: string | undefined,
  tracks: Track[],
): Promise<FinalizedPlaylist> {
  const userId = useSupabaseAuthStore.getState().user?.id;
  if (!userId) throw new Error("Sign in to import a playlist.");

  const playlist = await createPlaylist(userId, {
    name: title.trim().slice(0, 200) || "Imported playlist",
    description: description?.trim()
      ? description.trim().slice(0, 2000)
      : null,
  });

  const unique = uniqueTracks(tracks);
  const saved =
    unique.length > 0
      ? await addTracksToPlaylist(playlist.id, unique.map(toClientTrack))
      : 0;

  return { playlistId: playlist.id, saved };
}
