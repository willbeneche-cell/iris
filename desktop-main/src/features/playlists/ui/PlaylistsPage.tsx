import { useState } from "react";
import { LuLink, LuPlus, LuTrash2 } from "react-icons/lu";
import { Link, useNavigate } from "react-router-dom";
import { PlaylistFill } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { ImportPlaylistDialog } from "@/features/library/ui/ImportPlaylistDialog";
import { usePlaylists } from "../hooks/usePlaylists";
import { usePlaylistCovers } from "../hooks/usePlaylistCovers";
import { PlaylistArtwork } from "./PlaylistArtwork";
import { CreatePlaylistDialog } from "./CreatePlaylistDialog";

export default function PlaylistsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { playlists, loading, error, createPlaylist, deletePlaylist } =
    usePlaylists();
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [armedId, setArmedId] = useState<string | null>(null);
  const covers = usePlaylistCovers(playlists.map((playlist) => playlist.id));

  return (
    <div className="flex h-full w-full flex-col gap-5 px-4 pb-8 pt-[max(16px,var(--page-inset-top))] md:px-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="m-0 text-[26px] font-[650] tracking-[-0.02em] text-text-primary">
          {t("common.playlists")}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex h-9 items-center gap-2 rounded-control border border-border-alpha-14 bg-bg-elevated px-3 text-[13px] font-medium text-text-primary cursor-pointer transition-colors hover:bg-bg-hover"
          >
            <LuLink size={16} />
            {t("common.import")}
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex h-9 items-center gap-2 rounded-control border border-border-alpha-14 bg-btn-primary-bg px-3 text-[13px] font-medium text-btn-primary-text cursor-pointer transition-opacity hover:opacity-90"
          >
            <LuPlus size={16} />
            {t("common.create")}
          </button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="m-0 text-caption text-accent-primary">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="aspect-square animate-pulse rounded-item bg-bg-elevated"
            />
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <PlaylistFill size={40} className="text-text-tertiary" />
          <p className="m-0 text-label font-medium text-text-primary">
            {t("playlist.empty_title")}
          </p>
          <p className="m-0 max-w-[320px] text-caption text-text-tertiary">
            {t("playlist.empty_subtitle")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {playlists.map((playlist) => (
            <div key={playlist.id} className="group relative">
              <Link
                to={`/playlists/${playlist.id}`}
                className="block rounded-item outline-none focus-visible:ring-2 focus-visible:ring-text-primary/60"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-item border border-border-alpha-14 bg-bg-elevated">
                  <PlaylistArtwork
                    title={playlist.name}
                    coverUrl={playlist.coverUrl}
                    trackCovers={covers[playlist.id]}
                    iconSize={38}
                  />
                </div>
                <p className="mb-0 mt-2 truncate text-[13.5px] font-medium text-text-primary">
                  {playlist.name}
                </p>
                <p className="m-0 truncate text-[11.5px] text-text-tertiary">
                  {playlist.isPublic
                    ? t("common.make_public")
                    : (playlist.description ?? t("playlist.playlist"))}
                </p>
              </Link>

              <button
                type="button"
                aria-label={t("common.delete")}
                title={t("common.delete")}
                onClick={(event) => {
                  event.preventDefault();
                  if (armedId !== playlist.id) {
                    setArmedId(playlist.id);
                    return;
                  }
                  setArmedId(null);
                  void deletePlaylist(playlist.id).catch(() => {});
                }}
                onBlur={() => setArmedId(null)}
                className={`absolute right-1.5 top-1.5 flex h-7 items-center gap-1 rounded-control border-none px-2 text-[11px] font-medium cursor-pointer transition-colors ${
                  armedId === playlist.id
                    ? "bg-accent-primary text-white"
                    : "bg-black/50 text-white opacity-0 group-hover:opacity-100"
                }`}
              >
                <LuTrash2 size={13} />
                {armedId === playlist.id ? t("common.confirm") : null}
              </button>
            </div>
          ))}
        </div>
      )}

      <ImportPlaylistDialog
        open={importOpen}
        onOpenChange={setImportOpen}
      />

      <CreatePlaylistDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={async (input) => {
          const playlist = await createPlaylist(input);
          setCreateOpen(false);
          navigate(`/playlists/${playlist.id}`);
        }}
      />
    </div>
  );
}
