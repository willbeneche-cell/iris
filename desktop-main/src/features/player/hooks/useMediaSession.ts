import { useEffect } from "react";
import { playerEngine } from "../engine/playerEngine";
import { usePlayerState } from "./usePlayerState";

const SEEK_STEP_S = 10;

const ACTIONS: MediaSessionAction[] = [
  "play",
  "pause",
  "stop",
  "previoustrack",
  "nexttrack",
  "seekbackward",
  "seekforward",
  "seekto",
];

function seekBy(deltaSeconds: number): void {
  const { positionMs, durationMs } = playerEngine.getSnapshot();
  const target = positionMs + deltaSeconds * 1000;
  const max = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
  playerEngine.seek(Math.min(Math.max(target, 0), max));
}

/**
 * Publishes the current track to the OS/MediaSession surface so playback can be
 * driven from the iOS/Android lock screen, Bluetooth controls and PC media keys.
 * Mount once (App), it is a no-op on browsers without the Media Session API.
 */
export function useMediaSession(): void {
  const { currentTrack, status, positionMs, durationMs, playbackRate } =
    usePlayerState();

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    const mediaSession = navigator.mediaSession;
    try {
      mediaSession.setActionHandler("play", () => playerEngine.resume());
      mediaSession.setActionHandler("pause", () => playerEngine.pause());
      mediaSession.setActionHandler("stop", () => {
        void playerEngine.stopAndClear();
      });
      mediaSession.setActionHandler("previoustrack", () => {
        void playerEngine.skipPrevious();
      });
      mediaSession.setActionHandler("nexttrack", () => {
        void playerEngine.skipNext();
      });
      mediaSession.setActionHandler("seekbackward", (details) => {
        seekBy(-(details.seekOffset ?? SEEK_STEP_S));
      });
      mediaSession.setActionHandler("seekforward", (details) => {
        seekBy(details.seekOffset ?? SEEK_STEP_S);
      });
      mediaSession.setActionHandler("seekto", (details) => {
        if (typeof details.seekTime !== "number") return;
        playerEngine.seek(details.seekTime * 1000);
      });
    } catch {
      // unsupported action on this platform — the rest still applies
    }

    return () => {
      for (const action of ACTIONS) {
        try {
          mediaSession.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    if (!currentTrack || typeof MediaMetadata === "undefined") {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artists,
      album: currentTrack.album?.title ?? "Iris",
      artwork: currentTrack.coverUrl
        ? [{ src: currentTrack.coverUrl, sizes: "512x512" }]
        : [],
    });
  }, [currentTrack]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    const mediaSession = navigator.mediaSession;

    mediaSession.playbackState =
      status === "playing"
        ? "playing"
        : status === "paused"
          ? "paused"
          : "none";

    const duration = durationMs / 1000;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const position = Math.min(Math.max(positionMs / 1000, 0), duration);
    try {
      mediaSession.setPositionState({
        duration,
        position,
        playbackRate: playbackRate > 0 ? playbackRate : 1,
      });
    } catch {
      // some browsers reject transient states; the next tick fixes it
    }
  }, [status, positionMs, durationMs, playbackRate]);
}
