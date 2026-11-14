export const DEFAULT_PRIMARY_API = "https://api.tryliner.fun";

/**
 * Same-origin serverless proxy (`api/[...path].ts` on Vercel). The proxy signs
 * the request with the Iris HMAC scheme and adds CORS, which a browser cannot
 * do on its own.
 */
export const WEB_PROXY_BASE = "/api";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isSecureBaseUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" ||
      (protocol === "http:" && LOOPBACK_HOSTS.has(hostname))
    );
  } catch {
    return false;
  }
}

function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.irisElectron);
}

function isBrowserRuntime(): boolean {
  return typeof window !== "undefined" && !isDesktopRuntime();
}

/** The legacy API host: a browser can only reach it through the proxy. */
function isLegacyDirectApi(url: string): boolean {
  try {
    return new URL(url).hostname === "api.tryliner.fun";
  } catch {
    return false;
  }
}

export function resolveApiBaseUrl(envUrl: string | undefined): string {
  const clean = envUrl?.trim().replace(/\/+$/, "");
  if (clean === WEB_PROXY_BASE || clean === "api") return WEB_PROXY_BASE;
  if (clean && isSecureBaseUrl(clean)) {
    // A deployed browser build cannot call the legacy host directly (CORS and
    // HMAC signing only exist in the desktop app): keep routing through /api
    // even when an older deployment still sets VITE_API_URL to that host.
    if (isBrowserRuntime() && import.meta.env.PROD && isLegacyDirectApi(clean))
      return WEB_PROXY_BASE;
    return clean;
  }
  // The desktop build signs requests in the Electron main process and can call
  // the API directly; a deployed browser build only has the proxy.
  if (isBrowserRuntime() && import.meta.env.PROD) return WEB_PROXY_BASE;
  return DEFAULT_PRIMARY_API;
}

const baseUrl = resolveApiBaseUrl(
  import.meta.env.VITE_API_URL as string | undefined,
);

export function getApiBaseUrl(): string {
  return baseUrl;
}

/** True when the base is a same-origin path (`/api`) rather than an origin. */
export function isRelativeApiBase(base: string = baseUrl): boolean {
  return base.startsWith("/");
}

/**
 * Absolute origin of the API, resolving `/api` against the page origin. Returns
 * an empty string when it cannot be resolved (no window, invalid override).
 */
export function getApiOrigin(base: string = baseUrl): string {
  try {
    const fallback = typeof window === "undefined" ? undefined : window.location.origin;
    return new URL(base, fallback).origin;
  } catch {
    return "";
  }
}
