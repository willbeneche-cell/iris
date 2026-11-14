import { Link, useLocation } from "react-router-dom";
import {
  BookmarksFill,
  Home7Fill,
  PlaylistFill,
  Search3Fill,
  User2Fill,
} from "@mingcute/react";
import { cn } from "@/shared/lib";
import { useTranslation } from "@/languages";

export interface MobileTabBarProps {
  searchOpen: boolean;
  onSearchToggle: () => void;
  onProfileOpen: () => void;
}

const itemClass =
  "flex flex-1 flex-col items-center justify-center gap-[3px] border-none bg-transparent p-0 text-[10px] font-medium tracking-tight transition-colors duration-150 cursor-pointer select-none";

/**
 * Bottom tab bar for < 768px. Sits above `env(safe-area-inset-bottom)` so the
 * iOS home indicator never overlaps the labels.
 */
export function MobileTabBar({
  searchOpen,
  onSearchToggle,
  onProfileOpen,
}: MobileTabBarProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  const isLibrary = pathname === "/library" || pathname.startsWith("/library/");
  const isPlaylists =
    pathname === "/playlists" || pathname.startsWith("/playlists/");
  const isHome = pathname === "/" || pathname === "/home";

  return (
    <nav
      aria-label={t("common.sidebar.home")}
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border-alpha-14 bg-surface-glass/95 backdrop-blur-2xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex h-[var(--mobile-tab-bar-height)] items-stretch">
        <Link
          to="/"
          aria-current={isHome ? "page" : undefined}
          className={cn(
            itemClass,
            isHome ? "text-accent-primary" : "text-text-tertiary",
          )}
        >
          <Home7Fill size={22} />
          <span>{t("common.sidebar.home")}</span>
        </Link>

        <button
          type="button"
          aria-pressed={searchOpen}
          onClick={onSearchToggle}
          className={cn(
            itemClass,
            searchOpen ? "text-accent-primary" : "text-text-tertiary",
          )}
        >
          <Search3Fill size={22} />
          <span>{t("common.sidebar.search")}</span>
        </button>

        <Link
          to="/library"
          aria-current={isLibrary ? "page" : undefined}
          className={cn(
            itemClass,
            isLibrary ? "text-accent-primary" : "text-text-tertiary",
          )}
        >
          <BookmarksFill size={22} />
          <span>{t("common.sidebar.library")}</span>
        </Link>

        <Link
          to="/playlists"
          aria-current={isPlaylists ? "page" : undefined}
          className={cn(
            itemClass,
            isPlaylists ? "text-accent-primary" : "text-text-tertiary",
          )}
        >
          <PlaylistFill size={22} />
          <span>{t("common.playlists")}</span>
        </Link>

        <button
          type="button"
          onClick={onProfileOpen}
          className={cn(itemClass, "text-text-tertiary")}
        >
          <User2Fill size={22} />
          <span>{t("common.account")}</span>
        </button>
      </div>
    </nav>
  );
}
