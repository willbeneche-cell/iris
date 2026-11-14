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

const SEARCH_URL = "https://genius.com/api/search/multi";
const REQUEST_TIMEOUT_MS = 7000;
const MIN_TITLE_SIMILARITY = 0.5;

interface GeniusSongResult {
  type?: string;
  title?: string;
  url?: string;
  primary_artist?: { name?: string };
}

interface GeniusSearchBody {
  response?: {
    sections?: { hits?: { type?: string; result?: GeniusSongResult }[] }[];
  };
}

async function request(
  url: string,
  accept: string,
  signal?: AbortSignal,
): Promise<Response> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: signal
        ? AbortSignal.any([signal, timeout.signal])
        : timeout.signal,
      headers: { Accept: accept },
    });
  } finally {
    clearTimeout(timer);
  }
}

function pickSong(body: GeniusSearchBody, hint: LyricsProviderHint) {
  let best: { song: GeniusSongResult; score: number } | null = null;
  for (const section of body.response?.sections ?? []) {
    for (const hit of section.hits ?? []) {
      const song = hit.result;
      if (!song?.url || hit.type !== "song") continue;
      const title = similarity(song.title ?? "", hint.title);
      if (title < MIN_TITLE_SIMILARITY) continue;
      const artist = similarity(song.primary_artist?.name ?? "", hint.artist);
      const score = title * 2 + artist;
      if (!best || score > best.score) best = { song, score };
    }
  }
  return best?.song ?? null;
}

/**
 * Genius markup holds one `data-lyrics-container` per visible block. `DOMParser`
 * keeps nested tags from breaking the extraction, `<br>` is turned into a real
 * line break first.
 */
function extractLyrics(html: string): string {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(
    html.replace(/<br\s*\/?>/gi, "\n"),
    "text/html",
  );
  const blocks = Array.from(
    doc.querySelectorAll('[data-lyrics-container="true"]'),
  );
  if (blocks.length === 0) return "";
  const text = blocks
    .map((block) => block.textContent ?? "")
    .join("\n")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    // section markers such as [Verse 1] are not sung
    .filter((line) => line.length > 0 && !/^\[[^\]]+\]$/.test(line))
    .join("\n")
    .trim();
  return text;
}

/**
 * Genius only serves plain lyrics and its page is cross-origin blocked outside
 * the desktop shell; failures stay local to this provider so LRCLib still wins.
 */
export const geniusProvider: LyricsProvider = {
  id: "genius",
  label: "Genius",
  kind: "client",
  async fetch(
    hint: LyricsProviderHint,
    signal?: AbortSignal,
  ): Promise<LyricsProviderOutcome> {
    try {
      const query = [hint.title, hint.artist].filter(Boolean).join(" ");
      const searchUrl = `${SEARCH_URL}?per_page=5&q=${encodeURIComponent(query)}`;
      const searchResponse = await request(searchUrl, "application/json", signal);
      if (!searchResponse.ok) {
        return {
          status: "error",
          message: `genius search responded ${searchResponse.status}`,
        };
      }
      const song = pickSong(
        (await searchResponse.json()) as GeniusSearchBody,
        hint,
      );
      if (!song?.url) return { status: "not_found" };

      const page = await request(song.url, "text/html", signal);
      if (!page.ok) {
        return {
          status: "error",
          message: `genius page responded ${page.status}`,
        };
      }
      const content = extractLyrics(await page.text());
      if (!content) return { status: "not_found" };

      const lineCount = countLyricsLines(content);
      const candidate: LyricsCandidate = {
        provider: "genius",
        lyrics: { format: "plain", content },
        syncLevel: "plain",
        contentKind: contentKindFor("plain"),
        syncHint: contentKindFor("plain"),
        matchedTrack: {
          ...(song.title ? { title: song.title } : {}),
          ...(song.primary_artist?.name
            ? { artists: [song.primary_artist.name] }
            : {}),
        },
        quality: scoreLyrics({
          provider: "genius",
          syncLevel: "plain",
          titleSimilarity: similarity(song.title ?? "", hint.title),
          artistSimilarity: similarity(
            song.primary_artist?.name ?? "",
            hint.artist,
          ),
          durationMs: hint.durationMs,
          lineCount,
        }),
      };
      return { status: "found", candidate };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "genius failed",
      };
    }
  },
};
