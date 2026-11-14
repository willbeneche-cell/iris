import type { LyricsStreamEvent } from "@/shared/contracts/lyrics";
import { log } from "@/shared/utils/logger";
import { geniusProvider } from "./genius";
import { lrclibProvider } from "./lrclib";
import type {
  LyricsProvider,
  LyricsProviderHint,
  LyricsProviderOutcome,
} from "./types";

export type { LyricsProvider, LyricsProviderHint, LyricsProviderOutcome };
export { geniusProvider, lrclibProvider };

/**
 * Providers the renderer calls itself. LRCLib is keyless and CORS-enabled so it
 * runs in the desktop shell and the web build; Genius only works where its page
 * can be fetched (the desktop shell relaxes CORS for genius.com).
 */
export const CLIENT_LYRICS_PROVIDERS: LyricsProvider[] = [
  lrclibProvider,
  geniusProvider,
];

/**
 * Word-level sources served by the Iris lyrics stream. Their `provider` events
 * arrive with the timings already aligned, which is why the renderer never
 * calls them directly; they stay registered so the provider switcher, the cache
 * rules (`isProvisionalLyricsCandidate`) and the priority order keep matching
 * the names the backend emits.
 */
export const SERVER_LYRICS_PROVIDERS: LyricsProvider[] = [
  { id: "cadence", label: "Cadence", kind: "server" },
  { id: "wordly", label: "Wordly", kind: "server" },
  { id: "polaris", label: "PolarisMono", kind: "server" },
];

export const LYRICS_PROVIDERS: LyricsProvider[] = [
  ...SERVER_LYRICS_PROVIDERS,
  ...CLIENT_LYRICS_PROVIDERS,
];

export function lyricsProviderLabel(id: string | null | undefined): string {
  if (!id) return "";
  const normalized = id.toLowerCase().trim();
  const known = LYRICS_PROVIDERS.find(
    (provider) => provider.id.toLowerCase() === normalized,
  );
  return known?.label ?? id;
}

function asError(error: unknown): LyricsProviderOutcome {
  return {
    status: "error",
    message: error instanceof Error ? error.message : "provider failed",
  };
}

/**
 * Runs the renderer-side providers in parallel and yields the same event shape
 * as the backend lyrics stream, so the player can treat both identically.
 */
export async function* streamClientLyrics(
  hint: LyricsProviderHint,
  signal?: AbortSignal,
): AsyncGenerator<LyricsStreamEvent> {
  const results = await Promise.all(
    CLIENT_LYRICS_PROVIDERS.map(async (provider) => ({
      provider,
      outcome: provider.fetch
        ? await provider.fetch(hint, signal).catch(asError)
        : asError(new Error("provider is not callable")),
    })),
  );

  if (signal?.aborted) return;

  let instrumental = false;
  let found = false;

  for (const { provider, outcome } of results) {
    if (outcome.status === "found") {
      found = true;
      yield {
        type: "provider",
        provider: provider.id,
        status: "found",
        syncLevel: outcome.candidate.syncLevel,
        candidate: outcome.candidate,
      };
    } else if (outcome.status === "instrumental") {
      instrumental = true;
      yield {
        type: "provider",
        provider: provider.id,
        status: "not_found",
        instrumental: true,
      };
    } else if (outcome.status === "error") {
      yield {
        type: "provider",
        provider: provider.id,
        status: "error",
        message: outcome.message,
      };
    } else {
      yield { type: "provider", provider: provider.id, status: "not_found" };
    }
  }

  yield {
    type: "done",
    cached: false,
    ...(found ? {} : { status: "not_found" as const }),
    ...(instrumental && !found ? { instrumental: true as const } : {}),
  };
}

/**
 * Wraps a lyrics stream so the renderer's providers take over as soon as the
 * Iris stream ends without a single usable candidate, or fails outright (the
 * legacy aggregation service is gone). Consumers keep one event stream and one
 * handler; `onError` lets callers keep their own error policy (e.g. rate limits)
 * and rethrow to skip the fallback.
 */
export async function* withClientLyricsFallback(
  primary: AsyncIterable<LyricsStreamEvent>,
  hint: LyricsProviderHint | undefined,
  signal?: AbortSignal,
  onError?: (error: unknown) => void,
): AsyncGenerator<LyricsStreamEvent> {
  let found = false;
  let instrumental = false;

  try {
    for await (const event of primary) {
      if (event.type === "provider" && event.status === "found") found = true;
      if (event.type === "done") {
        instrumental = Boolean(event.instrumental);
        // Nothing usable: hold this `done` back so the consumer keeps reading
        // and receives the renderer chain's results (and its own `done`).
        if (!found) break;
        yield event;
        return;
      }
      yield event;
    }
  } catch (error) {
    if (signal?.aborted) return;
    if (onError) onError(error);
    log(
      "red",
      "lyrics",
      `stream failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (found || signal?.aborted) return;

  if (!hint?.title.trim() || !hint.artist.trim()) {
    yield {
      type: "done",
      cached: false,
      status: "not_found",
      ...(instrumental ? { instrumental: true as const } : {}),
    };
    return;
  }

  yield* streamClientLyrics(hint, signal);
}
