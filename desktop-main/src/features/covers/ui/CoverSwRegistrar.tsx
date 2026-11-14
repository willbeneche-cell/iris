import { useEffect } from "react";

/**
 * Registers the Iris service worker (public/sw.js): app shell, hashed build
 * assets and cover art caching behind a single scope. The Electron renderer is
 * served from file:// and must never install a worker.
 */
export function CoverSwRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const isElectron =
      window.location.protocol === "file:" ||
      typeof (window as any).irisElectron !== "undefined";

    if (isElectron) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          void reg.unregister();
        }
      });
      return;
    }

    // Caching a dev server would pin stale modules between edits.
    if (import.meta.env.DEV) return;

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Registration failure is non-fatal — the app works, just without
      // offline caching or the install prompt.
    });
  }, []);

  return null;
}
