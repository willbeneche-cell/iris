import { memo } from "react";
import { SkipNext } from "@solar-icons/react";
import {
  ICON_PAUSE,
  ICON_PLAY,
  PlayerMorphIcon,
  playerEngine,
  usePlayerState,
  usePlayerStore,
} from "@/features/player";
import { CoverImage } from "@/features/covers";
import { cn } from "@/shared/lib";

export interface MobileMiniPlayerProps {
  className?: string;
}

/**
 * Floating card above the bottom tab bar (< 768px). Tapping it opens the
 * full-screen player; the transport controls stay usable without leaving the
 * current page.
 */
export function MobileMiniPlayer({ className }: MobileMiniPlayerProps) {
  const player = usePlayerState();
  const setFullscreen = usePlayerStore((state) => state.setFullscreen);
  const track = player.currentTrack;

  if (!track) return null;

  const duration = player.durationMs > 0 ? player.durationMs : track.durationMs;
  const progress =
    duration > 0 ? Math.min(1, Math.max(0, player.positionMs / duration)) : 0;
  const isPlaying = player.status === "playing";

  return (
    <div
      className={cn("fixed inset-x-2 z-[59] md:hidden", className)}
      style={{
        bottom:
          "calc(var(--mobile-tab-bar-height) + env(safe-area-inset-bottom, 0px) + 8px)",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={track.title}
        onClick={() => setFullscreen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setFullscreen(true);
          }
        }}
        className="relative overflow-hidden rounded-item border border-border-alpha-14 bg-surface-glass shadow-[0_8px_28px_rgba(0,0,0,0.28)] backdrop-blur-2xl transition-transform duration-150 active:scale-[0.99]"
      >
        <div className="absolute inset-x-0 top-0 h-[2px] bg-border-alpha-14">
          <div
            className="h-full bg-accent-primary transition-[width] duration-500 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <div className="flex items-center gap-3 px-2.5 py-2">
          <CoverImage
            src={track.coverUrl}
            alt={track.title}
            width={40}
            height={40}
            priority
            draggable={false}
            className="h-10 w-10 shrink-0 rounded-control object-cover"
          />

          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium leading-tight text-text-primary">
              {track.title}
            </p>
            <p className="truncate text-[11px] leading-tight text-text-tertiary">
              {track.artists}
            </p>
          </div>

          <button
            type="button"
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={(event) => {
              event.stopPropagation();
              playerEngine.togglePlayPause();
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-none bg-transparent text-text-primary cursor-pointer active:scale-95 transition-transform"
          >
            <PlayerMorphIcon
              icon={isPlaying ? ICON_PAUSE : ICON_PLAY}
              size={18}
            />
          </button>

          <button
            type="button"
            aria-label="Next track"
            onClick={(event) => {
              event.stopPropagation();
              void playerEngine.skipNext();
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-none bg-transparent text-text-secondary cursor-pointer active:scale-95 transition-transform"
          >
            <SkipNext size={19} weight="Outline" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(MobileMiniPlayer);
