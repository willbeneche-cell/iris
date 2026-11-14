import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/shared/supabase/client";

const MAX_COVERS = 4;

type CoverMap = Record<string, string[]>;

/**
 * Spotify-style artwork for playlists that have no uploaded cover: the covers
 * of their first tracks, which the collage turns into a 2x2 mosaic. Read-only
 * and best effort — a failed query just leaves the playlist on its fallback.
 */
export function usePlaylistCovers(playlistIds: string[]): CoverMap {
  const [covers, setCovers] = useState<CoverMap>({});
  const key = useMemo(
    () => [...new Set(playlistIds)].filter(Boolean).sort().join("|"),
    [playlistIds],
  );

  useEffect(() => {
    const ids = key ? key.split("|") : [];
    if (ids.length === 0) {
      setCovers({});
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let cancelled = false;
    void Promise.all(
      ids.map(async (id) => {
        const { data, error } = await supabase
          .from("playlist_tracks")
          .select("track_data, position")
          .eq("playlist_id", id)
          .order("position", { ascending: true })
          .limit(MAX_COVERS);
        if (error) return [id, []] as const;
        const urls = (data ?? [])
          .map((row) => {
            const payload = row.track_data as { coverUrl?: unknown } | null;
            return typeof payload?.coverUrl === "string" ? payload.coverUrl : "";
          })
          .filter((url): url is string => url.length > 0);
        return [id, urls] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      setCovers(Object.fromEntries(entries) as CoverMap);
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return covers;
}
