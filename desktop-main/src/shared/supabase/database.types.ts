/**
 * Row types for the Iris schema (supabase/migrations/20261114000000_iris_init.sql).
 *
 * The client is intentionally untyped at the transport level: queries are
 * mapped through these interfaces at the feature boundary. Once the project is
 * linked, `supabase gen types typescript` can replace this file with the full
 * generated `Database` type.
 */

export interface ProfileRow {
  id: string;
  username: string;
  avatar_url: string | null;
  updated_at: string;
}

export interface ProfileUpdate {
  username?: string;
  avatar_url?: string | null;
}

export interface PlaylistRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  is_public: boolean;
  created_at: string;
}

export interface PlaylistInsert {
  user_id: string;
  name: string;
  description?: string | null;
  cover_url?: string | null;
  is_public?: boolean;
}

export interface PlaylistUpdate {
  name?: string;
  description?: string | null;
  cover_url?: string | null;
  is_public?: boolean;
}

export interface PlaylistTrackData {
  title: string;
  artist: string;
  durationMs: number;
  coverUrl: string;
  audioUrl?: string;
  explicit?: boolean;
  album?: { id: string; title: string };
}

export interface PlaylistTrackRow {
  id: string;
  playlist_id: string;
  track_id: string;
  track_data: PlaylistTrackData;
  position: number;
  added_at: string;
}

/** public.liked_tracks — cloud "liked songs", one row per user and track. */
export interface LikedTrackRow {
  user_id: string;
  track_id: string;
  track_data: PlaylistTrackData;
  created_at: string;
}
