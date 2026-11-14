import type { LyricsCandidate } from "@/shared/contracts/lyrics";

export interface LyricsProviderHint {
  title: string;
  artist: string;
  durationMs?: number;
}

export type LyricsProviderOutcome =
  | { status: "found"; candidate: LyricsCandidate }
  | { status: "instrumental" }
  | { status: "not_found" }
  | { status: "error"; message: string };

export interface LyricsProvider {
  id: string;
  label: string;
  /**
   * `client` providers are called by the renderer itself, `server` providers are
   * delivered as `provider` events by the Iris lyrics stream (word-level
   * timings that only the backend can compute).
   */
  kind: "client" | "server";
  fetch?: (
    hint: LyricsProviderHint,
    signal?: AbortSignal,
  ) => Promise<LyricsProviderOutcome>;
}
