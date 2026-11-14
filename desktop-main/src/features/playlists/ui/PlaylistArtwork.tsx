import { PlaylistFill } from "@mingcute/react";
import CoverImage from "@/features/covers/ui/CoverImage";
import { CoverCollage } from "@/features/library/ui/PlaylistCard";
import { cn } from "@/shared/lib";

export interface PlaylistArtworkProps {
  title: string;
  coverUrl?: string | null;
  /** Covers of the first tracks, used when there is no uploaded cover. */
  trackCovers?: string[];
  /** Sizing hint for the underlying image request. */
  sizes?: string;
  iconSize?: number;
  className?: string;
}

/**
 * Artwork rules, matching Spotify:
 * 1. a custom playlist cover wins;
 * 2. otherwise the first four track covers become a 2x2 mosaic;
 * 3. with one to three tracks the first track cover fills the frame;
 * 4. an empty playlist shows a gradient with the playlist glyph.
 */
export function PlaylistArtwork({
  title,
  coverUrl,
  trackCovers,
  sizes = "(max-width: 768px) 50vw, 16vw",
  iconSize = 28,
  className,
}: PlaylistArtworkProps) {
  const urls = (
    coverUrl ? [coverUrl] : (trackCovers ?? []).filter(Boolean)
  ).slice(0, 4);

  if (urls.length === 0) {
    return (
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-[linear-gradient(135deg,#2b2742_0%,#17151f_52%,#0b0b10_100%)]",
          className,
        )}
      >
        <PlaylistFill size={iconSize} className="text-white/35" />
      </div>
    );
  }

  // A mosaic only reads as a mosaic at four; one to three tracks keep the
  // first cover full frame.
  if (urls.length < 4) {
    return (
      <CoverImage
        src={urls[0]}
        alt={title}
        fill
        sizes={sizes}
        className="object-cover transition-all duration-300 group-hover:brightness-[1.15]"
        draggable={false}
        unoptimized
      />
    );
  }

  return <CoverCollage urls={urls} title={title} />;
}
