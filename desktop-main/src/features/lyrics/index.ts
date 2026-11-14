export {
  parseRawLyrics,
  applyLyricsOffset,
  type ParsedLyrics,
  type WordData,
} from "./engine/lyricsParser";
export {
  useLyricsStore,
  hasSyncedLyricsSources,
  type LyricsProviderOption,
} from "./store/lyricsStore";
export {
  lyricsCache,
  isLyricsCandidate,
  shouldCacheLyricsCandidate,
  isProvisionalLyricsCandidate,
  mergeLyricsProvider,
  compareLyricsCandidates,
  isBetterLyricsCandidate,
  isWordLevelSync,
  type CachedLyricsItem,
} from "./store/lyricsCache";
export {
  useLyricsAnimator,
  type LyricsWord,
  type SyncedLine,
} from "./hooks/useLyricsAnimator";
export { LyricsProviderIsland } from "./ui/LyricsProviderIsland";
export {
  CLIENT_LYRICS_PROVIDERS,
  SERVER_LYRICS_PROVIDERS,
  LYRICS_PROVIDERS,
  lyricsProviderLabel,
  streamClientLyrics,
  withClientLyricsFallback,
  type LyricsProvider,
  type LyricsProviderHint,
} from "./providers";
export {
  LyricsCanvasRenderer,
  type LyricsClock,
  type EdgesListener,
} from "./canvas/lyricsCanvasRenderer";
