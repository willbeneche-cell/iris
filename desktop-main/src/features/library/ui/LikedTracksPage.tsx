import { useTranslation } from "@/languages";
import { useLikedTracks } from "../hooks";
import { useLikesCover } from "../hooks/useLikesCover";
import { SavedTracksView } from "../saved/ui/SavedLikesPage";

/**
 * Cloud "Titres likés" (public.liked_tracks). The list is kept in sync by the
 * shared likes store, so a heart toggled anywhere shows up here immediately.
 */
export default function LikedTracksPage() {
  const { t } = useTranslation();
  const likesCover = useLikesCover();
  const { data, isLoading } = useLikedTracks();

  return (
    <SavedTracksView
      pageKey="liked-tracks"
      title={t("library.liked_songs")}
      subtitle={t("library.saved.subtitle")}
      cover={likesCover}
      tracks={data.tracks}
      isLoading={isLoading}
      emptyTitle={t("library.saved.empty_title")}
      emptySubtitle={t("library.saved.empty_subtitle")}
    />
  );
}
