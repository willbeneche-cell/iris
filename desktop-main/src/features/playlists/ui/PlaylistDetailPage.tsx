import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  LuArrowDown,
  LuArrowUp,
  LuChevronLeft,
  LuPlay,
  LuPlus,
  LuTrash2,
} from "react-icons/lu";
import { useTranslation } from "@/languages";
import Dialog from "@/shared/ui/Dialog";
import { DialogActions, DialogButton } from "@/shared/ui";
import { playerEngine } from "@/features/player";
import { usePlaylistTracks } from "../hooks/usePlaylists";
import { deletePlaylist } from "../api";
import { toTrack } from "../types";
import { AddTracksDialog } from "./AddTracksDialog";
import { PlaylistArtwork } from "./PlaylistArtwork";

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "--:--";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function PlaylistDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { playlistId } = useParams<{ playlistId: string }>();
  const { playlist, tracks, loading, error, addTrack, removeTrack, reorder } =
    usePlaylistTracks(playlistId ?? null);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const queue = useMemo(() => tracks.map(toTrack), [tracks]);
  const coverUrls = useMemo(
    () =>
      tracks
        .map((track) => track.data.coverUrl)
        .filter((url): url is string => Boolean(url))
        .slice(0, 4),
    [tracks],
  );
  const existingTrackIds = useMemo(
    () => new Set(tracks.map((track) => track.trackId)),
    [tracks],
  );

  const playAll = () => {
    if (queue.length === 0) return;
    playerEngine.primeUserGesture();
    void playerEngine.playTrack(
      queue[0],
      queue,
      playlist?.name ?? "Iris",
      playlist?.coverUrl ?? queue[0].coverUrl,
    );
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= tracks.length) return;
    const next = [...tracks];
    [next[index], next[target]] = [next[target], next[index]];
    void reorder(next.map((row) => row.rowId));
  };

  return (
    <div className="flex h-full w-full flex-col gap-5 px-4 pb-8 pt-[max(16px,var(--page-inset-top))] md:px-6">
      <Link
        to="/playlists"
        className="flex w-fit items-center gap-1 text-caption text-text-secondary transition-colors hover:text-text-primary"
      >
        <LuChevronLeft size={15} />
        {t("common.playlists")}
      </Link>

      <header className="flex items-end gap-4">
        <div className="relative h-[120px] w-[120px] shrink-0 overflow-hidden rounded-item border border-border-alpha-14 bg-bg-elevated">
          <PlaylistArtwork
            title={playlist?.name ?? ""}
            coverUrl={playlist?.coverUrl}
            trackCovers={coverUrls}
            sizes="120px"
            iconSize={40}
          />
        </div>

        <div className="min-w-0 flex-1 pb-1">
          <h1 className="m-0 truncate text-[26px] font-[650] tracking-[-0.02em] text-text-primary">
            {playlist?.name ?? t("common.playlists")}
          </h1>
          {playlist?.description ? (
            <p className="m-0 mt-1 line-clamp-2 text-caption text-text-tertiary">
              {playlist.description}
            </p>
          ) : null}
          <p className="m-0 mt-1 text-caption text-text-tertiary">
            {t("common.songs", { count: tracks.length })}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={playAll}
              disabled={queue.length === 0}
              className="flex h-9 items-center gap-2 rounded-control border-none bg-btn-primary-bg px-3 text-[13px] font-medium text-btn-primary-text cursor-pointer transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
            >
              <LuPlay size={15} />
              {t("common.play_all")}
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex h-9 items-center gap-2 rounded-control border border-border-alpha-14 bg-transparent px-3 text-[13px] font-medium text-text-primary cursor-pointer transition-colors hover:bg-fill"
            >
              <LuPlus size={15} />
              {t("common.add")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              aria-label={t("common.delete")}
              title={t("common.delete")}
              className="flex h-9 w-9 items-center justify-center rounded-control border border-border-alpha-14 bg-transparent text-text-tertiary cursor-pointer transition-colors hover:bg-red-500/10 hover:text-red-500"
            >
              <LuTrash2 size={15} />
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <p role="alert" className="m-0 text-caption text-accent-primary">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-[52px] animate-pulse rounded-control bg-bg-elevated"
            />
          ))}
        </div>
      ) : tracks.length === 0 ? (
        <p className="m-0 py-10 text-center text-caption text-text-tertiary">
          {t("playlist.empty_subtitle")}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {tracks.map((row, index) => {
            const track = toTrack(row);
            return (
              <li
                key={row.rowId}
                className="group flex items-center gap-3 rounded-control p-1.5 transition-colors hover:bg-fill"
              >
                <span className="w-5 shrink-0 text-center text-[11.5px] tabular-nums text-text-tertiary">
                  {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    playerEngine.primeUserGesture();
                    void playerEngine.playTrack(
                      track,
                      queue,
                      playlist?.name ?? "Iris",
                      playlist?.coverUrl ?? track.coverUrl,
                    );
                  }}
                  className="relative h-10 w-10 shrink-0 overflow-hidden rounded-control border-none bg-bg-elevated p-0 cursor-pointer"
                  aria-label={track.title}
                >
                  {track.coverUrl ? (
                    <img
                      src={track.coverUrl}
                      alt=""
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <LuPlay size={14} />
                  </span>
                </button>

                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[13px] text-text-primary">
                    {track.title}
                  </p>
                  <p className="m-0 truncate text-[11.5px] text-text-tertiary">
                    {track.artists}
                  </p>
                </div>

                <span className="shrink-0 text-[11.5px] tabular-nums text-text-tertiary">
                  {formatDuration(track.durationMs)}
                </span>

                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="flex h-7 w-7 items-center justify-center rounded-control border-none bg-transparent text-text-secondary cursor-pointer hover:bg-border-alpha-14 disabled:opacity-30"
                  >
                    <LuArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={index === tracks.length - 1}
                    onClick={() => move(index, 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-control border-none bg-transparent text-text-secondary cursor-pointer hover:bg-border-alpha-14 disabled:opacity-30"
                  >
                    <LuArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("common.remove")}
                    onClick={() => void removeTrack(row.rowId)}
                    className="flex h-7 w-7 items-center justify-center rounded-control border-none bg-transparent text-text-tertiary cursor-pointer hover:bg-red-500/10 hover:text-red-500"
                  >
                    <LuTrash2 size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AddTracksDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existingTrackIds={existingTrackIds}
        onAdd={addTrack}
      />

      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => (next ? undefined : setConfirmOpen(false))}
        maxWidth={380}
      >
        <div className="flex flex-col gap-2 px-5 pb-5 pt-4">
          <h2 className="m-0 text-[16px] font-semibold text-text-primary">
            {t("common.delete")}
          </h2>
          <p className="m-0 text-caption text-text-tertiary">
            {t("common.delete_playlist_desc")}
          </p>
          <DialogActions className="mt-3">
            <DialogButton
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              {t("common.cancel")}
            </DialogButton>
            <DialogButton
              variant="primary"
              disabled={deleting}
              onClick={async () => {
                if (!playlistId) return;
                setDeleting(true);
                try {
                  await deletePlaylist(playlistId);
                  setConfirmOpen(false);
                  navigate("/playlists", { replace: true });
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {t("common.delete")}
            </DialogButton>
          </DialogActions>
        </div>
      </Dialog>
    </div>
  );
}
