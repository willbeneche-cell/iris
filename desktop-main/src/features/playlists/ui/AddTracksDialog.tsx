import { useState } from "react";
import { LuPlus, LuSearch } from "react-icons/lu";
import { useTranslation } from "@/languages";
import Dialog from "@/shared/ui/Dialog";
import TextInput from "@/shared/ui/TextInput";
import { useSearchTracks } from "@/features/search/hooks";
import type { Track } from "@/shared/types";

export interface AddTracksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingTrackIds: ReadonlySet<string>;
  onAdd: (track: Track) => Promise<void>;
}

/** Search the catalogue and append tracks to the current Supabase playlist. */
export function AddTracksDialog({
  open,
  onOpenChange,
  existingTrackIds,
  onAdd,
}: AddTracksDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { tracks, loading, hasLoaded } = useSearchTracks(query, {
    enabled: open,
    limit: 20,
    debounceMs: 300,
  });

  const close = () => {
    setQuery("");
    setError("");
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
      maxWidth={460}
      maxHeight="70vh"
    >
      <div className="flex min-h-0 flex-col gap-3 px-5 pb-5 pt-4">
        <h2 className="m-0 text-[16px] font-semibold text-text-primary">
          {t("common.add")}
        </h2>

        <TextInput
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("common.search")}
          icon={<LuSearch size={15} />}
        />

        {error ? (
          <p role="alert" className="m-0 text-caption text-accent-primary">
            {error}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && tracks.length === 0 ? (
            <p className="m-0 py-6 text-center text-caption text-text-tertiary">
              {t("common.loading")}
            </p>
          ) : tracks.length === 0 && hasLoaded ? (
            <p className="m-0 py-6 text-center text-caption text-text-tertiary">
              {t("common.no_results")}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {tracks.map((track) => {
                const already = existingTrackIds.has(track.id);
                return (
                  <li key={track.id}>
                    <button
                      type="button"
                      disabled={already || pendingId === track.id}
                      onClick={async () => {
                        setPendingId(track.id);
                        setError("");
                        try {
                          await onAdd(track);
                        } catch (cause) {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : String(cause),
                          );
                        } finally {
                          setPendingId(null);
                        }
                      }}
                      className="flex w-full items-center gap-3 rounded-control border-none bg-transparent p-1.5 text-left cursor-pointer transition-colors hover:bg-fill disabled:cursor-default disabled:opacity-45"
                    >
                      <img
                        src={track.coverUrl}
                        alt=""
                        draggable={false}
                        className="h-9 w-9 shrink-0 rounded-control object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-text-primary">
                          {track.title}
                        </span>
                        <span className="block truncate text-[11px] text-text-tertiary">
                          {track.artists}
                        </span>
                      </span>
                      <LuPlus
                        size={16}
                        className="shrink-0 text-text-secondary"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  );
}
