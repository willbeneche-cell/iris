import { useCallback, useSyncExternalStore } from "react";

export const MOBILE_BREAKPOINT_QUERY = "(max-width: 767px)";

/**
 * SSR/Electron-safe media query subscription. The server snapshot always uses
 * `defaultValue`, so hydration never flashes the wrong layout.
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) {
        return () => {};
      }
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onStoreChange);
      return () => mediaQueryList.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia)
      return defaultValue;
    return window.matchMedia(query).matches;
  }, [query, defaultValue]);

  return useSyncExternalStore(subscribe, getSnapshot, () => defaultValue);
}

/** true below the 768px breakpoint (mobile / installed PWA). */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_BREAKPOINT_QUERY, false);
}
