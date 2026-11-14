import { ThemeProvider } from "next-themes";
import GlobalTooltip from "@/shared/ui/GlobalTooltip";
import { OverlayPlayer } from "@/features/overlay/ui/OverlayPlayer";
import "./globals.css";

/**
 * Overlay window entry.
 *
 * Authentication is owned by the main process: it only creates/reveals this
 * window once the renderer reported a signed-in Supabase session, and hides it
 * again on sign-out. Gating here on the removed legacy session made the window
 * render nothing and close itself.
 */
export default function OverlayApp() {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="dark"
      enableSystem={false}
      forcedTheme="dark"
    >
      <GlobalTooltip />
      <OverlayPlayer />
    </ThemeProvider>
  );
}
