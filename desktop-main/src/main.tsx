import React from "react";
import ReactDOM from "react-dom/client";
import { initGlobalErrorHandlers } from "@/shared/utils/globalErrorHandlers";
import { hydrateScreenCache } from "@/shared/cache/screenCache";
import { applyStoredTheme } from "@/shared/utils/storedTheme";

initGlobalErrorHandlers();

const isOverlay = window.location.hash.startsWith("#/overlay");

if (!isOverlay) applyStoredTheme();

async function loadRoot(): Promise<React.ReactElement> {
  if (isOverlay) {
    const { default: OverlayApp } = await import("./app/OverlayApp");
    return <OverlayApp />;
  }
  const [
    { initMainWindowServices },
    { default: App },
    { default: RootErrorBoundary },
  ] = await Promise.all([
    import("./app/mainWindowServices"),
    import("./app/App"),
    import("@/shared/ui/RootErrorBoundary"),
    hydrateScreenCache(),
  ]);
  initMainWindowServices();
  return (
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
}

const IMPORT_ATTEMPTS = 2;
const IMPORT_RETRY_DELAY_MS = 400;

/**
 * The shell is imported dynamically so the overlay entry stays small. Vite
 * re-optimizes dependencies while a page loads when a dependency is new or its
 * cache is stale; that in-flight import then fails with a 504 and the browser
 * only reports "Failed to fetch dynamically imported module". Retrying once
 * after the re-optimization settles turns that into a normal startup.
 */
async function loadRootResilient(): Promise<React.ReactElement> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= IMPORT_ATTEMPTS; attempt += 1) {
    try {
      return await loadRoot();
    } catch (error) {
      lastError = error;
      if (attempt < IMPORT_ATTEMPTS) {
        await new Promise((resolve) =>
          setTimeout(resolve, IMPORT_RETRY_DELAY_MS),
        );
      }
    }
  }
  throw lastError;
}

const rootElement = document.getElementById("root");

if (rootElement) {
  void loadRootResilient()
    .then((root) => {
      ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>{root}</React.StrictMode>,
      );
    })
    .catch((error: unknown) => {
      // Never leave an unhandled rejection with a blank window behind it.
      console.error("[Iris] failed to load the app shell", error);
      rootElement.textContent =
        "Iris could not load its interface. Reload the window to try again.";
    });
}
