import type { LyricsCandidate } from "@/shared/contracts/lyrics";
import {
  contentKindFor,
  countLyricsLines,
  scoreLyrics,
  similarity,
} from "./matching";
import type {
  LyricsProvider,
  LyricsProviderHint,
  LyricsProviderOutcome,
} from "./types";

const BASE_URL = "https://lrclib.net/api";
const REQUEST_TIMEOUT_MS = 7000;
const MIN_TITLE_SIMILARITY = 0.34;

interface LrclibRecord {
  id?: number;
  trackName?: string | null;
  artistName?: string | null;
  albumName?: string | null;
  duration?: number | null;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

async function getJson(
  url: string,
  signal?: AbortSignal,
): Promise<unknown | null> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: signal
        ? AbortSignal.any([signal, timeout.signal])
        : timeout.signal,
      headers: { Accept: "application/json" },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`lrclib responded ${response.status}`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function toCandidate(
  record: LrclibRecord,
  hint: LyricsProviderHint,
): LyricsCandidate | null {
  const synced = record.syncedLyrics?.trim();
  const plain = record.plainLyrics?.trim();
  const content = synced || plain;
  if (!content) return null;

  const format = synced ? "lrc" : "plain";
  const syncLevel = synced ? "line_level" : "plain";
  const lineCount = countLyricsLines(content);
  const matchedDurationMs =
    typeof record.duration === "number" ? Math.round(record.duration * 1000) : undefined;

  return {
    provider: "lrclib",
    lyrics: { format, content },
    syncLevel,
    contentKind: contentKindFor(syncLevel),
    syncHint: contentKindFor(syncLevel),
    matchedTrack: {
      ...(record.trackName ? { title: record.trackName } : {}),
      ...(record.artistName ? { artists: [record.artistName] } : {}),
      ...(matchedDurationMs ? { durationMs: matchedDurationMs } : {}),
    },
    quality: scoreLyrics({
      provider: "lrclib",
      syncLevel,
      titleSimilarity: similarity(record.trackName ?? "", hint.title),
      artistSimilarity: similarity(record.artistName ?? "", hint.artist),
      matchedDurationMs,
      durationMs: hint.durationMs,
      lineCount,
    }),
  };
}

function bestOf(records: LrclibRecord[], hint: LyricsProviderHint) {
  let best: { record: LrclibRecord; score: number } | null = null;
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const title = similarity(record.trackName ?? "", hint.title);
    if (title < MIN_TITLE_SIMILARITY) continue;
    const artist = similarity(record.artistName ?? "", hint.artist);
    const durationPenalty =
      record.duration && hint.durationMs
        ? Math.min(
            1,
            Math.abs(record.duration * 1000 - hint.durationMs) / 15000,
          )
        : 0.5;
    const score = title * 2 + artist - durationPenalty;
    if (!best || score > best.score) best = { record, score };
  }
  return best?.record ?? null;
}

/**
 * LRCLib is keyless, CORS-enabled and serves both LRC and plain lyrics, so it is
 * the primary renderer-side provider.
 */
export const lrclibProvider: LyricsProvider = {
  id: "lrclib",
  label: "LRCLib",
  kind: "client",
  async fetch(
    hint: LyricsProviderHint,
    signal?: AbortSignal,
  ): Promise<LyricsProviderOutcome> {
    try {
      const params = new URLSearchParams({
        track_name: hint.title,
        artist_name: hint.artist,
      });
      if (hint.durationMs && hint.durationMs > 0) {
        params.set("duration", String(Math.round(hint.durationMs / 1000)));
      }

      const exact = await getJson(`${BASE_URL}/get?${params.toString()}`, signal);
      let record =
        exact && !Array.isArray(exact) ? (exact as LrclibRecord) : null;

      if (!record) {
        const search = await getJson(
          `${BASE_URL}/search?${params.toString()}`,
          signal,
        );
        record = Array.isArray(search)
          ? bestOf(search as LrclibRecord[], hint)
          : null;
      }

      if (!record) return { status: "not_found" };
      if (record.instrumental) return { status: "instrumental" };

      const candidate = toCandidate(record, hint);
      return candidate
        ? { status: "found", candidate }
        : { status: "not_found" };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "lrclib failed",
      };
    }
  },
};
