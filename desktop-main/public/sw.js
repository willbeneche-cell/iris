/* Iris — service worker unique.
 *
 * Un seul SW contrôle le scope "/" : il gère à la fois le shell PWA, les assets
 * statiques et les pochettes. L'ancien cover-sw.js est fusionné ici pour éviter
 * que deux enregistrements au même scope ne se remplacent mutuellement.
 */

const VERSION = "iris-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
// Nom conservé : lu par src/shared/utils/cacheManager.ts (renommé à l'étape 4).
const COVER_CACHE = "iris-covers-v2";

const SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

const COVER_HOSTS = [
  "yt3.googleusercontent.com",
  "lh3.googleusercontent.com",
  "covers.tryliner.fun",
  "i1.sndcdn.com",
  "i2.sndcdn.com",
  "i3.sndcdn.com",
  "i4.sndcdn.com",
  "img.sndcdn.com",
  "a1.sndcdn.com",
  "i.pinimg.com",
  "images.genius.com",
  "yandex-images.clstorage.net",
];

const COVER_MAX_ENTRIES = 600;
const STATIC_DESTINATIONS = new Set(["script", "style", "font", "image"]);

// ---------------------------------------------------------------------------
// Installation : précache du shell (non bloquant si un asset manque)
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL_ASSETS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch {
            // un asset absent ne doit pas empêcher l'installation
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

// ---------------------------------------------------------------------------
// Activation : purge des anciennes versions iris-*, prise de contrôle
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("iris-") &&
              key !== SHELL_CACHE &&
              key !== ASSET_CACHE,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// ---------------------------------------------------------------------------
// Stratégies
// ---------------------------------------------------------------------------
async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === "basic") {
      await cache.put("/", response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match("/", { ignoreVary: true });
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  const network = fetch(request)
    .then(async (response) => {
      if (response && response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

function isCoverRequest(url) {
  try {
    const parsed = new URL(url);
    if (
      !parsed.pathname ||
      parsed.pathname === "/" ||
      parsed.pathname === "/health"
    ) {
      return false;
    }
    return COVER_HOSTS.some(
      (host) =>
        parsed.hostname === host || parsed.hostname.endsWith("." + host),
    );
  } catch {
    return false;
  }
}

const coverInFlight = new Map();

async function cacheFirstCover(request) {
  const cache = await caches.open(COVER_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;

  const key = request.url;
  let pending = coverInFlight.get(key);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(request);
      if (response.ok && response.type !== "opaque") {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        if (keys.length > COVER_MAX_ENTRIES) {
          await Promise.all(
            keys
              .slice(0, keys.length - COVER_MAX_ENTRIES)
              .map((entry) => cache.delete(entry)),
          );
        }
      }
      return response;
    })().finally(() => coverInFlight.delete(key));
    coverInFlight.set(key, pending);
  }

  return (await pending).clone();
}

// ---------------------------------------------------------------------------
// Routage
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (url.pathname === "/sw.js") return;

  if (isCoverRequest(request.url)) {
    event.respondWith(cacheFirstCover(request).catch(() => Response.error()));
    return;
  }

  // Les appels API / Supabase / médias distants passent directement au réseau.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (STATIC_DESTINATIONS.has(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
