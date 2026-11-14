import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "@/shared/types";
import { getSupabaseClient } from "@/shared/supabase/client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import {
  addTrackToPlaylist,
  createPlaylist as createPlaylistRequest,
  deletePlaylist as deletePlaylistRequest,
  getPlaylist,
  listPlaylistTracks,
  listPlaylists,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
  updatePlaylist as updatePlaylistRequest,
} from "../api";
import type {
  CreatePlaylistInput,
  Playlist,
  PlaylistTrack,
  UpdatePlaylistInput,
} from "../types";

export interface UsePlaylistsResult {
  playlists: Playlist[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createPlaylist: (input: CreatePlaylistInput) => Promise<Playlist>;
  updatePlaylist: (id: string, patch: UpdatePlaylistInput) => Promise<Playlist>;
  deletePlaylist: (id: string) => Promise<void>;
}

/**
 * Playlists of the signed-in user, kept live through Supabase Realtime.
 * RLS scopes every query to `auth.uid()`.
 */
export function usePlaylists(): UsePlaylistsResult {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Every hook instance joins its own topic: Supabase refuses two joins on the
  // same one (sidebar + page can watch the same table at once).
  const channelName = useRef(
    `iris:playlists:${Math.random().toString(36).slice(2)}`,
  );

  const refresh = useCallback(async () => {
    if (!userId) {
      setPlaylists([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setPlaylists(await listPlaylists(userId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return;

    const channel = supabase
      .channel(channelName.current)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "playlists",
          filter: `user_id=eq.${userId}`,
        },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  const createPlaylist = useCallback(
    async (input: CreatePlaylistInput) => {
      if (!userId) throw new Error("Not signed in.");
      const playlist = await createPlaylistRequest(userId, input);
      setPlaylists((current) => [playlist, ...current]);
      return playlist;
    },
    [userId],
  );

  const updatePlaylist = useCallback(
    async (id: string, patch: UpdatePlaylistInput) => {
      const playlist = await updatePlaylistRequest(id, patch);
      setPlaylists((current) =>
        current.map((item) => (item.id === id ? playlist : item)),
      );
      return playlist;
    },
    [],
  );

  const deletePlaylist = useCallback(async (id: string) => {
    await deletePlaylistRequest(id);
    setPlaylists((current) => current.filter((item) => item.id !== id));
  }, []);

  return {
    playlists,
    loading,
    error,
    refresh,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
  };
}

export interface UsePlaylistTracksResult {
  playlist: Playlist | null;
  tracks: PlaylistTrack[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addTrack: (track: Track) => Promise<void>;
  removeTrack: (rowId: string) => Promise<void>;
  reorder: (orderedRowIds: string[]) => Promise<void>;
}

/**
 * One playlist and its ordered tracks. Mutations are optimistic for reordering
 * and reconciled from the server on every realtime event.
 */
export function usePlaylistTracks(
  playlistId: string | null,
): UsePlaylistTracksResult {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [loading, setLoading] = useState(Boolean(playlistId));
  const [error, setError] = useState<string | null>(null);
  const channelName = useRef(
    `iris:playlist:${Math.random().toString(36).slice(2)}`,
  );

  const refresh = useCallback(async () => {
    if (!playlistId) {
      setPlaylist(null);
      setTracks([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [nextPlaylist, nextTracks] = await Promise.all([
        getPlaylist(playlistId),
        listPlaylistTracks(playlistId),
      ]);
      setPlaylist(nextPlaylist);
      setTracks(nextTracks);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    setLoading(Boolean(playlistId));
    void refresh();
  }, [playlistId, refresh]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !playlistId) return;

    const channel = supabase
      .channel(channelName.current)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "playlist_tracks",
          filter: `playlist_id=eq.${playlistId}`,
        },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [playlistId, refresh]);

  const addTrack = useCallback(
    async (track: Track) => {
      if (!playlistId) throw new Error("No playlist selected.");
      await addTrackToPlaylist(playlistId, track);
      await refresh();
    },
    [playlistId, refresh],
  );

  const removeTrack = useCallback(
    async (rowId: string) => {
      setTracks((current) => current.filter((item) => item.rowId !== rowId));
      try {
        await removeTrackFromPlaylist(rowId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        await refresh();
      }
    },
    [refresh],
  );

  const reorder = useCallback(
    async (orderedRowIds: string[]) => {
      if (!playlistId) return;
      const byId = new Map(tracks.map((item) => [item.rowId, item]));
      const next = orderedRowIds
        .map((rowId) => byId.get(rowId))
        .filter((item): item is PlaylistTrack => Boolean(item));
      if (next.length === tracks.length) {
        setTracks(next.map((item, index) => ({ ...item, position: index })));
      }
      try {
        await reorderPlaylistTracks(playlistId, orderedRowIds);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        await refresh();
      }
    },
    [playlistId, tracks, refresh],
  );

  return {
    playlist,
    tracks,
    loading,
    error,
    refresh,
    addTrack,
    removeTrack,
    reorder,
  };
}
