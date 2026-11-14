import type { StoreApi, UseBoundStore } from "zustand";
import { addTrackToPlaylist } from "@/features/playlists/api";
import type { Track } from "@/shared/types";
import { showToast } from "@/shared/ui";
import { createTranslatorSync, getStoredLocale } from "@/languages";
import { notifyLibraryChanged } from "../hooks/usePlaylists";
import type { ActiveImportState } from "./importStore";

export function watchPendingTrackAfterImport(
  store: UseBoundStore<StoreApi<ActiveImportState>>,
): void {
  let lastHandledJobId: string | null = null;

  store.subscribe((state) => {
    const { job, pendingTrack } = state;
    if (!job || job.status !== "completed" || !job.playlistId || !pendingTrack)
      return;
    if (job.id === lastHandledJobId) return;
    lastHandledJobId = job.id;
    const playlistId = job.playlistId;

    store.setState({ pendingTrack: null });

    void (async () => {
      const translate = createTranslatorSync(getStoredLocale());
      try {
        const track: Track = {
          id: pendingTrack.id,
          title: pendingTrack.title,
          artists: pendingTrack.artists,
          coverUrl: pendingTrack.coverUrl,
          durationMs: pendingTrack.durationMs ?? 0,
          playCount: 0,
        };
        await addTrackToPlaylist(playlistId, track);
        notifyLibraryChanged();
        showToast(translate("common.added_to_playlist"), "checkmark", {
          description: pendingTrack.title || undefined,
        });
      } catch {
        showToast(translate("common.failed_add_playlist"), "error");
      }
    })();
  });
}
