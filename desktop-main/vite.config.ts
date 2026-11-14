import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import path from "path";
import pkg from "./package.json" with { type: "json" };
import { contentSecurityPolicyPlugin } from "./vite.csp.ts";

// The PWA build (Vercel, or IRIS_WEB_ONLY=1 locally) must not run the Electron
// main/preload build: it needs no native toolchain and would ship a 1.5 MB
// main-process bundle into a static deployment.
const webOnlyBuild = Boolean(process.env.VERCEL) || Boolean(process.env.IRIS_WEB_ONLY);

export default defineConfig(({ command, mode }) => {
  if (command === "serve") {
    const devEnv = loadEnv(mode, process.cwd(), ["IRIS_", "VITE_API_URL"]);
    for (const name of [
      "IRIS_DEV_SIGNING_SECRET",
      "IRIS_SIMULATE",
      "IRIS_SIMULATE_COUNTRY",
      "VITE_API_URL",
    ]) {
      if (devEnv[name] && !process.env[name]) process.env[name] = devEnv[name];
    }
  }

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    optimizeDeps: {
      // Pre-bundled when the server starts. A dependency discovered mid-session
      // forces a re-optimization that makes the in-flight dynamic import fail.
      include: ["@supabase/supabase-js"],
    },
    plugins: [
      react(),
      tailwindcss(),
      contentSecurityPolicyPlugin(),
      ...(webOnlyBuild
        ? []
        : [
            electron({
              main: {
                entry: "electron/main.ts",
                vite: {
                  define: {
                    __IRIS_CHANNEL__: JSON.stringify(
                      process.env.IRIS_CHANNEL ?? "production",
                    ),
                  },
                },
              },
              preload: {
                input: "electron/preload.ts",
                vite: {
                  build: {
                    rollupOptions: {
                      output: {
                        format: "cjs",
                        entryFileNames: "preload.cjs",
                      },
                    },
                  },
                },
              },
            }),
          ]),
    ],
    clearScreen: false,
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
        "next/navigation": path.resolve(
          import.meta.dirname,
          "./src/lib/navigation.tsx",
        ),
        "next/link": path.resolve(
          import.meta.dirname,
          "./src/lib/navigation.tsx",
        ),
        "next/image": path.resolve(
          import.meta.dirname,
          "./src/components/ui/AppImage.tsx",
        ),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      chunkSizeWarningLimit: 2048,
    },
  };
});
