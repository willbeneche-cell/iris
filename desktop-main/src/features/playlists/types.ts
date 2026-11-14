import type { Track } from "@/shared/types";
import type { PlaylistTrackData } from "@/shared/supabase/database.types";

export type Playlist = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  isPublic: boolean;
  createdAt: string;
};

export type PlaylistTrack = {
  /** playlist_tracks.id — used for removal and reordering */
  rowId: string;
  playlistId: string;
  trackId: string;
  data: PlaylistTrackData;
  position: number;
  addedAt: string;
};

export interface CreatePlaylistInput {
  name: string;
  description?: string | null;
  coverUrl?: string | null;
  isPublic?: boolean;
}

export interface UpdatePlaylistInput {
  name?: string;
  description?: string | null;
  coverUrl?: string | null;
  isPublic?: boolean;
}

/** JSONB payload stored per playlist entry: enough to render and play offline. */
export function toPlaylistTrackData(track: Track): PlaylistTrackData {
  return {
    title: track.title,
    artist: track.artists,
    durationMs: track.durationMs,
    coverUrl: track.coverUrl,
    ...(track.album ? { album: track.album } : {}),
    ...(track.explicit ? { explicit: true } : {}),
  };
}

export function toTrack(row: PlaylistTrack): Track {
  return {
    id: row.trackId,
    title: row.data.title,
    artists: row.data.artist,
    coverUrl: row.data.coverUrl,
    durationMs: row.data.durationMs,
    playCount: 0,
    explicit: row.data.explicit,
    album: row.data.album,
  };
}
