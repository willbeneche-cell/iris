# Iris — Architecture fusionnée (Desktop + PWA)

Document de référence de l'**Étape 1**. Les trois dépôts Liner restent en place
(leurs scripts et lockfiles fonctionnent tels quels) ; le renommage physique des
dossiers est prévu avec la génération des sources (Étape 4).

---

## 1. Fusion des 3 dépôts

| Dépôt actuel  | Rôle d'origine                              | Rôle dans Iris                                             | Cible        |
| ------------- | ------------------------------------------- | ---------------------------------------------------------- | ------------ |
| `desktop-main`| Client Electron + React (Vite), FSD          | App unique **desktop + web/PWA** (même bundle, même logique)| `apps/app`   |
| `covers-main` | Worker Cloudflare proxy de pochettes         | Worker `covers` (`covers.iris.app`)                        | `workers/covers` |
| `link-main`   | Worker Cloudflare de redirection `liner://`  | Worker `link` (`link.iris.app`) → deep links `iris://`     | `workers/link`   |
| —             | —                                            | **Nouveau** : backend Supabase (Auth + Postgres + Storage + Realtime) | `supabase/` |

Points d'intégration :

- `covers-main` reste un Worker séparé, appelé par le client via `VITE_COVERS_PROXY_URL`.
- `link-main` ne sert plus que les partages publics ; le schéma d'URL passe de
  `liner://` à `iris://` (protocole Electron + pages du worker, Étape 4).
- Supabase remplace toute persistance ad-hoc pour les **données utilisateur**
  (profils, playlists). Le catalogue/streaming existant n'est pas touché.

---

## 2. Arborescence complète

```
Iris/
├── README.md                                  # à réécrire (Étape 4)
├── package.json                               # workspace pnpm racine (Étape 4)
├── pnpm-workspace.yaml                        # apps/*, workers/*
├── .env.example                               # variables partagées (Étape 4)
│
├── docs/
│   ├── IRIS-ARCHITECTURE.md                   # CE FICHIER
│   └── DESIGN.md                              # design system (repris de desktop-main)
│
├── supabase/
│   ├── migrations/
│   │   └── 20261114000000_iris_init.sql        # ÉTAPE 2 : tables + RLS + storage + realtime
│   └── config.toml                             # optionnel (supabase CLI)
│
├── desktop-main/                               # → apps/app
│   ├── index.html                              # ÉTAPE 3 : meta iOS + manifest + thème
│   ├── package.json                            # name "@iris/app", productName "Iris"
│   ├── vite.config.ts                          # dev port 5173
│   ├── vite.csp.ts                             # CSP : ajouter le domaine Supabase
│   ├── tsconfig.json
│   ├── public/
│   │   ├── manifest.json                       # ÉTAPE 3 : manifeste PWA complet
│   │   ├── sw.js                               # ÉTAPE 3 : service worker unique (shell + assets + pochettes)
│   │   └── icons/
│   │       ├── icon-192.png
│   │       ├── icon-512.png
│   │       ├── icon-maskable-512.png
│   │       └── apple-touch-icon.png
│   ├── scripts/
│   │   └── generate-pwa-icons.mjs              # génère les 4 icônes (script Node, zéro dépendance)
│   ├── electron/
│   │   ├── main.ts                             # productName / appId / protocole iris://
│   │   ├── preload.ts
│   │   ├── deeplink.ts                         # iris://artist|album|playlist|track
│   │   ├── auth-session-ipc.ts / auth-session-store.ts
│   │   ├── overlay.ts / discord.ts / updater…
│   │   └── crypto.ts / signer.ts
│   └── src/
│       ├── main.tsx
│       ├── app/
│       │   ├── App.tsx
│       │   ├── routes.tsx                      # /, /library, /library/*, /search, /player, /login
│       │   ├── globals.css                     # tokens dark + accent Iris
│       │   ├── OverlayApp.tsx
│       │   └── mainWindowServices.ts
│       ├── widgets/
│       │   ├── sidebar/                        # desktop ≥ 768px
│       │   ├── player-bar/                     # barre persistante desktop
│       │   ├── header/
│       │   ├── right-drawer/
│       │   ├── fullscreen-player/
│       │   ├── mini-player/                    # mobile : mini-player au-dessus des tabs
│       │   ├── mobile-tab-bar/                 # NOUVEAU (Étape 4) — safe-area-inset-bottom
│       │   └── mobile-player-sheet/            # NOUVEAU (Étape 4) — lecteur plein écran
│       ├── features/
│       │   ├── auth/                           # existant (login OAuth/API) — à brancher sur Supabase
│       │   ├── playlists/                      # NOUVEAU (Étape 4) : usePlaylists, ui/*
│       │   ├── player/                         # engine, store, ui
│       │   ├── home/  search/  library/  artist/  collection/
│       │   ├── lyrics/  covers/  overlay/  navigation/
│       │   ├── settings/  shortcuts/  updater/  connectivity/
│       │   └── youtube-auth/  discord/  human-check/  touchbar/
│       ├── entities/
│       │   ├── track/  artist/  playlist/  user/
│       ├── shared/
│       │   ├── supabase/                       # NOUVEAU (Étape 4)
│       │   │   ├── client.ts                   # createClient (env VITE_SUPABASE_*)
│       │   │   ├── database.types.ts           # types générés (supabase gen types)
│       │   │   └── realtime.ts                 # souscriptions playlists / playlist_tracks
│       │   ├── api/  cache/  config/  contracts/
│       │   ├── media/  storage/  telemetry/  ui/
│       │   └── pwa/                            # (registrar déplacé ici à l'Étape 4)
│       └── languages/                          # i18n
│
├── covers-main/                                # → workers/covers
│   ├── src/index.ts  src/index.test.ts
│   ├── wrangler.toml                           # name = "iris-covers"
│   └── .env.example
│
└── link-main/                                  # → workers/link
    ├── app.mjs  page.mjs  server.mjs  share.mjs  worker.mjs
    ├── open.test.mjs  share.test.mjs
    └── wrangler.toml                           # name = "iris-link"
```

---

## 3. Rebranding Liner → Iris

Remplacement **littéral et contrôlé** (pas de `sed` global : les domaines
`tryliner.fun` seraient cassés). Fichiers concernés lors de l'Étape 4 :

| Avant | Après |
| --- | --- |
| `Liner`, `Liner Music Player` (titres, README, meta) | `Iris`, `Iris — Music Player` |
| `@liner/client`, `@liner/covers-worker`, `@tryliner/link` | `@iris/app`, `@iris/covers`, `@iris/link` |
| `productName: "Liner"`, `appId: com.hkamori.liner` | `productName: "Iris"`, `appId: app.iris.player` |
| `executableName: "liner"`, `desktopName` | `iris` |
| protocole `liner://` | `iris://` (`electron/main.ts`, `deeplink.ts`, `link-main/*.mjs`) |
| `window.linerElectron` | `window.irisElectron` (`preload.ts`, `src/electron.d.ts`, signers) |
| `x-liner-signature`, `x-liner-timestamp`, `x-liner-nonce` | `x-iris-signature`, `x-iris-timestamp`, `x-iris-nonce` |
| `LINER_DEV_SIGNING_SECRET`, `LINER_SIMULATE*`, `LINER_CHANNEL` | `IRIS_DEV_SIGNING_SECRET`, `IRIS_SIMULATE*`, `IRIS_CHANNEL` |
| `covers.tryliner.fun`, `api.tryliner.fun` | `covers.iris.app`, `api.iris.app` |
| cache `liner-covers-v2` | `iris-covers-v2` (aligner `src/shared/utils/cacheManager.ts`) |
| `linerDb` (IndexedDB) | `irisDb` |
| worker `liner-covers` / `liner-link` | `iris-covers` / `iris-link` |

Déjà appliqué à l'Étape 3 : `index.html` (titre, meta), manifeste, service
worker, `.env.example` (variables Supabase), nom des caches PWA.

---

## 4. Comportement par support

| Contrainte | Desktop (≥ 768px) | Mobile / PWA (< 768px) |
| --- | --- | --- |
| Navigation | sidebar fixe gauche | bottom tab bar fixe |
| Lecture | `player-bar` horizontale persistante | `mini-player` flottant → `mobile-player-sheet` plein écran |
| Zones sûres | aucune | `env(safe-area-inset-bottom)` + `viewport-fit=cover` |
| Volume | slider horizontal | dissimulé dans le lecteur plein écran |
| Détection | CSS `md:` + `useMediaQuery` (`matchMedia`, événement `change`) | idem |

Un seul arbre de composants, une seule logique métier : le layout est choisi
par media query, jamais par duplication de routes ou de stores.

---

## 5. Backend Supabase

### Variables (`.env` local / Variables de build)

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

La clé `anon` est publique : la sécurité repose **entièrement** sur les policies
RLS de `supabase/migrations/20261114000000_iris_init.sql`. Aucune clé
`service_role` ne doit jamais entrer dans le bundle client.

### Modules à générer (Étape 4)

- `shared/supabase/client.ts` — client unique (`persistSession`, `autoRefreshToken`,
  `detectSessionInUrl`, `flowType: "pkce"`).
- `features/auth/hooks/useAuth.ts` — `signUp`, `signInWithPassword`, `signOut`,
  `session`, `user`, `loading`; garde de route privée sur `/library`, `/playlists`, `/profile`.
- `features/playlists/hooks/usePlaylists.ts` — CRUD playlists + ajout/retrait de
  morceaux, abonnement `postgres_changes` sur `playlists` et `playlist_tracks`.
- `features/playlists/ui/*` — liste, détail, modale de création/édition.

### Modèle de données

- `profiles` : 1 ligne par `auth.users`, créée par trigger `handle_new_user`.
- `playlists` : `user_id` → `profiles`, `is_public` lisible par `anon`.
- `playlist_tracks` : `track_data` JSONB (titre, artiste, durée, url audio,
  pochette), `position` pour l'ordre, unique `(playlist_id, track_id)`.
- Storage : buckets publics `avatars` et `playlist-covers`, écriture limitée au
  dossier `<user_id>/…`.
- Realtime : `playlists` + `playlist_tracks` ajoutées à `supabase_realtime`,
  `replica identity full` pour que les updates RLS soient diffusées.

---

## 6. PWA (Étape 3 — fichiers déjà en place)

| Fichier | Rôle |
| --- | --- |
| `desktop-main/public/manifest.json` | `display: standalone`, `theme_color`/`background_color` `#07070B`, icônes 192/512 + maskable |
| `desktop-main/index.html` | `viewport-fit=cover`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, lien manifeste |
| `desktop-main/public/sw.js` | précache shell, stale-while-revalidate assets hashés, network-first navigations, cache pochettes |
| `desktop-main/scripts/generate-pwa-icons.mjs` | génère `public/icons/*.png` |
| `src/features/covers/ui/CoverSwRegistrar.tsx` | enregistre `/sw.js` (web uniquement, jamais en Electron ni en dev) |

Un seul service worker peut contrôler un scope : l'ancien `cover-sw.js` (scope
`/`) est **fusionné** dans `sw.js` pour éviter que l'un remplace l'autre. Le nom
de cache `liner-covers-v2` est conservé pour rester compatible avec les stats de
`cacheManager` (renommé à l'Étape 4).

Commande de régénération des icônes :

```bash
cd desktop-main && node scripts/generate-pwa-icons.mjs
```

---

## 7. Ordre d'exécution restant (Étape 4)

1. `supabase db push` (ou coller la migration dans le SQL Editor) puis vérifier
   que les 3 tables ont `rowsecurity = true`.
2. Client Supabase + `useAuth` + garde de routes privées.
3. Layout responsive : sidebar/player-bar ↔ bottom tabs/mini-player/sheet.
4. `usePlaylists` + UI playlists + abonnement realtime.
5. Renommage Liner → Iris (tableau §3) + workers `iris-covers`/`iris-link`.
6. `pnpm check` (oxlint + prettier + `tsc -b && vite build` + vitest).
