import type {
  LyricsContentKind,
  LyricsQuality,
  LyricsSyncLevel,
} from "@/shared/contracts/lyrics";

const BRACKETS = /[([{][^)\]}]*[)\]}]/g;

/**
 * Lowercases, drops accents and bracketed suffixes such as "(Remastered 2011)"
 * or "[feat. X]" and collapses everything else to single spaces, so titles from
 * a lyrics database can be compared with the catalog's title.
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(BRACKETS, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalizeText(value).split(" ").filter(Boolean));
}

/** Dice coefficient over word sets: 0 when unrelated, 1 when identical. */
export function similarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

const SOURCE_WEIGHT: Record<string, number> = {
  "polaris mono": 10,
  polaris: 9,
  cadence: 8,
  wordly: 7,
  lrclib: 6,
  genius: 5,
};

const SYNC_WEIGHT: Record<LyricsSyncLevel, number> = {
  plain: 0,
  line_level: 12,
  word_level: 18,
  syllable_level: 20,
};

export interface ScoreLyricsInput {
  provider: string;
  syncLevel: LyricsSyncLevel;
  /** 0..1 word overlap between the matched record and the played track. */
  titleSimilarity: number;
  artistSimilarity: number;
  matchedDurationMs?: number;
  durationMs?: number;
  lineCount: number;
}

/**
 * Local equivalent of the backend's quality model, so candidates fetched by the
 * renderer rank against cached ones through `compareLyricsCandidates`.
 */
export function scoreLyrics(input: ScoreLyricsInput): LyricsQuality {
  const reasons: string[] = [];

  let durationScore = 0;
  if (input.matchedDurationMs && input.durationMs) {
    const delta = Math.abs(input.matchedDurationMs - input.durationMs);
    durationScore = delta <= 2000 ? 1 : delta <= 5000 ? 0.8 : delta <= 12000 ? 0.5 : 0.2;
    reasons.push(`duration Δ${Math.round(delta / 1000)}s`);
  }

  const match = Math.round(
    Math.min(1, Math.max(0, input.titleSimilarity)) * 34 +
      Math.min(1, Math.max(0, input.artistSimilarity)) * 20 +
      durationScore * 16,
  );

  const content = Math.min(28, 10 + input.lineCount * 2);
  if (input.lineCount > 0) reasons.push(`${input.lineCount} lines`);

  const sync = SYNC_WEIGHT[input.syncLevel] ?? 0;
  if (sync > 0) reasons.push(input.syncLevel);

  const source = SOURCE_WEIGHT[input.provider.toLowerCase().trim()] ?? 3;

  const total = Math.max(
    0,
    Math.min(100, Math.round(match + content + sync + source)),
  );

  return { total, match, content, sync, source, reasons };
}

/** Number of non-empty lines in a lyrics payload. */
export function countLyricsLines(content: string): number {
  return content.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

export function contentKindFor(syncLevel: LyricsSyncLevel): LyricsContentKind {
  switch (syncLevel) {
    case "syllable_level":
      return "syllable_synced";
    case "word_level":
      return "word_synced";
    case "line_level":
      return "line_synced";
    default:
      return "plain";
  }
}
