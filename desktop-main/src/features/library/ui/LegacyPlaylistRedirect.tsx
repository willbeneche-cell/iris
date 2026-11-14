import { Navigate, useSearchParams } from "react-router-dom";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `/library/playlist?id=…` was the legacy playlist route, backed by the old
 * account API. Playlists now live in Supabase under `/playlists/:id`; `likes`
 * keeps the local saved-tracks page and anything else returns to the library
 * instead of rendering an empty legacy screen.
 */
export default function LegacyPlaylistRedirect() {
  const [params] = useSearchParams();
  const id = params.get("id");

  if (id === "likes") return <Navigate to="/library/likes" replace />;
  if (id && UUID.test(id)) return <Navigate to={`/playlists/${id}`} replace />;
  return <Navigate to="/library" replace />;
}
