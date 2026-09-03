// AUTO-GENERATED from docs/integrations/*/README.md by scripts/gen-catalog.mjs.
// Do not edit by hand — run `npm run gen:catalog` (also runs before every build).

export interface CatalogEntry {
  id: string
  name: string
  category: string
  tags: string[]
  builtin: boolean          // a built-in Stoa panel (no external integration)
  status: string            // tested | needs-testing | experimental | new
  officialUrl?: string
  polling?: string
  secretFormat?: string     // canonical enum; absent for built-in panels
  urlRequired?: boolean
  exampleUrl?: string
  whatIs: string
  gettingKey?: string
}

export const CATALOG: CatalogEntry[] = [
  {
    "id": "emby",
    "name": "Emby",
    "category": "Media Servers",
    "tags": [
      "movies",
      "tv",
      "streaming",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Emby is a media server that organizes and streams your movies, TV shows, music, and photos to apps across phones, tablets, TVs, and browsers. It sits between Plex and Jellyfin in philosophy — a polished product with a free tier plus an optional **Premiere** subscription that unlocks extras like hardware transcoding, mobile sync, and cover art. Core library management and streaming work without Premiere.",
    "officialUrl": "https://emby.media",
    "polling": "30s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8096",
    "gettingKey": "Emby → **Settings → Advanced → API Keys → New API Key**. Give it any name (e.g. `stoa`) and copy the generated key.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Emby server port, e.g. `http://192.168.1.10:8096`"
  },
  {
    "id": "immich",
    "name": "Immich",
    "category": "Media Servers",
    "tags": [
      "photos",
      "backup",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Immich is a self-hosted photo and video backup and management app — a privacy-focused alternative to Google Photos. It automatically backs up your phone's camera roll, then organizes everything with face recognition, object and scene search, albums, and map and timeline views, all on hardware you control.",
    "officialUrl": "https://immich.app",
    "polling": "30min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:2283",
    "gettingKey": "Immich → top-right avatar → **Account Settings → API Keys → New API Key** — copy it.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Immich port, e.g. `http://192.168.1.10:2283`"
  },
  {
    "id": "jellyfin",
    "name": "Jellyfin",
    "category": "Media Servers",
    "tags": [
      "movies",
      "tv",
      "streaming",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Jellyfin is a free, fully open-source media server — a community-driven alternative to Plex and Emby with no paid tiers and no account requirement. It catalogs your movies, TV shows, music, and photos with artwork and metadata and streams them to web, mobile, and TV clients, transcoding when a device needs it. Because it's self-contained and open source, nothing phones home and every feature is available without a subscription.",
    "officialUrl": "https://jellyfin.org",
    "polling": "60s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8096",
    "gettingKey": "Jellyfin → **Administration → Dashboard → API Keys** → click the `+` button to create a new key, then copy it.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Jellyfin server port, e.g. `http://192.168.1.10:8096`"
  },
  {
    "id": "jellystat",
    "name": "Jellystat",
    "category": "Media Servers",
    "tags": [
      "analytics",
      "jellyfin",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Jellystat is a self-hosted statistics and watch-history dashboard for Jellyfin — essentially what Tautulli is to Plex. It syncs with your Jellyfin server and records play activity, then breaks it down by user, media type, and title so you can see what's being watched and by whom. It's an add-on analytics layer, not a media server.",
    "officialUrl": "https://github.com/CyferShepard/Jellystat",
    "polling": "60s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:3004",
    "gettingKey": "Jellystat → **Settings** → generate or copy the **API Key** from the API section.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Jellystat port, e.g. `http://192.168.1.10:3004`"
  },
  {
    "id": "photoprism",
    "name": "PhotoPrism",
    "category": "Media Servers",
    "tags": [
      "photos",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "PhotoPrism is a self-hosted, AI-powered photo management app for browsing, organizing, and sharing large personal photo collections. It automatically tags photos by content, recognizes faces, maps geotagged shots, and groups them into moments — running entirely on your own server with no cloud dependency.",
    "officialUrl": "https://www.photoprism.app",
    "polling": "30min",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:2342",
    "gettingKey": "Use your PhotoPrism login credentials in `username:password` form (e.g. `admin:yourpassword`). If your instance runs with no password, leave the secret blank.\n\n- **Secret format:** `username:password` (or blank for a public instance)\n- **URL:** required — point at your PhotoPrism port, e.g. `http://192.168.1.10:2342`"
  },
  {
    "id": "plex",
    "name": "Plex",
    "category": "Media Servers",
    "tags": [
      "movies",
      "tv",
      "streaming",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Plex is a media server that organizes your personal collection of movies, TV shows, music, and photos and streams it to apps on phones, tablets, TVs, browsers, and streaming boxes — inside or outside your home. It scans your files, fetches artwork and metadata, tracks watch progress per user, and transcodes on the fly when a device can't play the original format. It's the most widely used self-hosted media server, with polished client apps on nearly every platform.",
    "officialUrl": "https://www.plex.tv",
    "polling": "60s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:32400",
    "gettingKey": "Sign in at plex.tv, open Plex Web in a browser, open DevTools → Network tab, find any `/library` request, and copy the `X-Plex-Token` query parameter. (Alternatively, see Plex's support article on finding an authentication token.)\n\n- **Secret format:** Plex token (`X-Plex-Token`)\n- **URL:** required — point at your Plex Media Server port, e.g. `http://192.168.1.10:32400`"
  },
  {
    "id": "tautulli",
    "name": "Tautulli",
    "category": "Media Servers",
    "tags": [
      "analytics",
      "plex",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Tautulli is a monitoring and analytics companion for Plex. It connects to your Plex Media Server and records everything that plays — who watched what, when, for how long, on which device, and whether it transcoded — then turns that into watch history, per-user statistics, most-watched charts, and notifications. It doesn't stream media itself; it's the reporting layer that sits on top of Plex.",
    "officialUrl": "https://tautulli.com",
    "polling": "60s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8181",
    "gettingKey": "Tautulli → **Settings → Web Interface** → scroll to the API section → copy the **API Key**.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Tautulli port, e.g. `http://192.168.1.10:8181`"
  },
  {
    "id": "tracearr",
    "name": "Tracearr",
    "category": "Media Servers",
    "tags": [
      "analytics",
      "monitoring",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Tracearr is a cross-platform analytics and account-sharing detection tool that sits on top of Plex, Jellyfin, and Emby at the same time. It aggregates play history from all three into one set of statistics and — its distinguishing feature — flags likely account sharing, surfacing sessions from unexpected locations or too many concurrent streams per user so you can spot abuse across a shared library. Like Tautulli and Jellystat, it's a reporting layer, not a media server.",
    "officialUrl": "https://tracearr.com",
    "polling": "60s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8000",
    "gettingKey": "Tracearr → **Settings → API** → copy the **API Key**.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Tracearr port, e.g. `http://192.168.1.10:8000`"
  },
  {
    "id": "autobrr",
    "name": "autobrr",
    "category": "Media Management",
    "tags": [
      "torrent",
      "automation",
      "indexers",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "autobrr is a torrent automation tool that monitors IRC announce channels on private trackers and RSS feeds in real time. When a new release is announced that matches one of your filters, autobrr grabs it instantly and pushes it to your configured download client — qBittorrent, Deluge, Radarr, Sonarr, and others.\n\nThis is fundamentally faster than letting Sonarr/Radarr poll RSS on their own schedule. IRC announces arrive within seconds of a release being posted; autobrr acts on them immediately.",
    "officialUrl": "https://autobrr.com",
    "polling": "30s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:7474",
    "gettingKey": "autobrr → **Settings → API → Create API key** → copy the key.\n\n- **Secret format:** plain API key\n- **URL:** required — e.g. `http://192.168.1.10:7474`"
  },
  {
    "id": "bazarr",
    "name": "Bazarr",
    "category": "Media Management",
    "tags": [
      "subtitles",
      "automation",
      "arr",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Bazarr is a companion to Sonarr and Radarr that manages subtitles. It monitors your TV and movie libraries and automatically downloads missing subtitles in the languages you choose, pulling from a wide range of subtitle providers and keeping coverage up to date as your library grows.",
    "officialUrl": "https://www.bazarr.media",
    "polling": "60s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:6767",
    "gettingKey": "Bazarr → **Settings → General → Security → API Key** — copy it.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Bazarr port, e.g. `http://192.168.1.10:6767`"
  },
  {
    "id": "lidarr",
    "name": "Lidarr",
    "category": "Media Management",
    "tags": [
      "music",
      "automation",
      "arr",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Lidarr is a music collection manager in the \"\\*arr\" family. It tracks the artists and albums you follow, automatically grabs new and wanted releases from your usenet and torrent indexers, hands them to your download client, and organizes the files into your library — the audio equivalent of Sonarr and Radarr.",
    "officialUrl": "https://lidarr.audio",
    "polling": "30min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8686",
    "gettingKey": "Lidarr → **Settings → General → Security → API Key** — copy it.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Lidarr port, e.g. `http://192.168.1.10:8686`"
  },
  {
    "id": "maintainerr",
    "name": "Maintainerr",
    "category": "Media Management",
    "tags": [
      "cleanup",
      "automation",
      "plex",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Maintainerr is a self-hosted media-management tool that automatically cleans up your Plex library based on rules you define — never-watched movies, shows not played in years, and so on. Rules build collections; items that meet the criteria and have aged past your delete-after window are removed automatically from Plex (and optionally unmonitored or deleted from Radarr/Sonarr).",
    "officialUrl": "https://maintainerr.info",
    "polling": "5min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:6246",
    "gettingKey": "Most Maintainerr instances run without authentication — leave the secret blank. If you've put it behind auth, paste your API token (or `username:password` for reverse-proxy Basic Auth).\n\n- **Secret format:** blank (no auth), Bearer token, or `username:password`\n- **URL:** required — point at your Maintainerr port, e.g. `http://192.168.1.10:6246`"
  },
  {
    "id": "overseerr",
    "name": "Overseerr / Jellyseerr",
    "category": "Media Management",
    "tags": [
      "requests",
      "movies",
      "tv",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Overseerr (for Plex) and Jellyseerr (for Jellyfin) are request-management tools for your media library. Users browse and request movies and TV shows; admins approve, decline, or let auto-approval handle it. Approved requests are handed off to Radarr and Sonarr for downloading. The two share the same API, so Stoa uses one integration type for both.",
    "officialUrl": "https://overseerr.dev",
    "polling": "5min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:5055",
    "gettingKey": "Overseerr/Jellyseerr → **Settings → General → API Key** — copy it.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Overseerr/Jellyseerr port, e.g. `http://192.168.1.10:5055`"
  },
  {
    "id": "prowlarr",
    "name": "Prowlarr",
    "category": "Media Management",
    "tags": [
      "indexers",
      "automation",
      "arr",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Prowlarr is an indexer manager and proxy for the \"\\*arr\" ecosystem. It connects to torrent and usenet indexers and exposes them to Sonarr, Radarr, Lidarr, and other apps through a unified API — so you manage your indexers in one place instead of configuring each one per app.",
    "officialUrl": "https://prowlarr.com",
    "polling": "60s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:9696",
    "gettingKey": "Prowlarr → **Settings → General → Security → API Key** — copy it.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Prowlarr port, e.g. `http://192.168.1.10:9696`"
  },
  {
    "id": "radarr",
    "name": "Radarr",
    "category": "Media Management",
    "tags": [
      "movies",
      "automation",
      "arr",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Radarr is a movie collection manager and the film counterpart to Sonarr in the \"\\*arr\" family. It watches for the movies you want, grabs them from your usenet and torrent indexers the moment a matching release appears, sends them to your download client, and organizes the results into your library with proper naming, artwork, and metadata.",
    "officialUrl": "https://radarr.video",
    "polling": "30min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:7878",
    "gettingKey": "Radarr → **Settings → General → Security → API Key** — copy it.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Radarr port, e.g. `http://192.168.1.10:7878`"
  },
  {
    "id": "readarr",
    "name": "Readarr",
    "category": "Media Management",
    "tags": [
      "books",
      "audiobooks",
      "automation",
      "arr",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Readarr is an ebook and audiobook collection manager in the \"\\*arr\" family. It follows the authors and books you want, grabs matching releases from your usenet and torrent indexers, hands them to your download client, and organizes them into your library. (Note: the Readarr project was retired by its maintainers in 2024 — existing installs keep working, but it's no longer actively developed.)",
    "officialUrl": "https://readarr.com",
    "polling": "30min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8787",
    "gettingKey": "Readarr → **Settings → General → Security → API Key** — copy it.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Readarr port, e.g. `http://192.168.1.10:8787`"
  },
  {
    "id": "sonarr",
    "name": "Sonarr",
    "category": "Media Management",
    "tags": [
      "tv",
      "automation",
      "arr",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Sonarr is a PVR (personal video recorder) for TV series in the \"\\*arr\" family. It monitors the shows you follow, automatically grabs new episodes the moment a matching release appears on your configured usenet and torrent indexers, hands them to your download client, then renames and files the results into your library with correct season/episode structure and artwork.",
    "officialUrl": "https://sonarr.tv",
    "polling": "30min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8989",
    "gettingKey": "Sonarr → **Settings → General → Security → API Key** — copy it.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Sonarr port, e.g. `http://192.168.1.10:8989`"
  },
  {
    "id": "tdarr",
    "name": "Tdarr",
    "category": "Media Management",
    "tags": [
      "transcoding",
      "automation",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Tdarr is a self-hosted media transcoding automation system. It scans your media libraries, runs files through configurable plugin stacks or flows (e.g. convert to H.265, remove unwanted streams, health-check containers), and manages a distributed worker pool across multiple nodes. Workers can run on the same machine as the server or on remote nodes.",
    "officialUrl": "https://tdarr.io",
    "polling": "30s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8265",
    "gettingKey": "Tdarr → **Tools → API Keys** to create a key. Leave the secret blank if your instance has no authentication; use `username:password` for a reverse-proxy Basic Auth setup.\n\n- **Secret format:** blank (no auth), plain API key, or `username:password` (reverse-proxy)\n- **URL:** required — point at your Tdarr port, e.g. `http://192.168.1.10:8265`"
  },
  {
    "id": "deluge",
    "name": "Deluge",
    "category": "Downloads",
    "tags": [
      "torrent",
      "downloads",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Deluge is a free, open-source, cross-platform BitTorrent client with a client-server architecture and a plugin system. Its Web UI lets you manage a headless daemon remotely, making it a common pick for always-on server downloading.",
    "officialUrl": "https://deluge-torrent.org",
    "polling": "30s",
    "secretFormat": "password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8112",
    "gettingKey": "Use your Deluge Web UI password — no username prefix (Deluge authenticates with a password only). The default is `deluge`; change it under Preferences → Interface.\n\n- **Secret format:** bare password (no username)\n- **URL:** required — point at the Deluge **Web UI** (default port 8112), e.g. `http://192.168.1.10:8112`"
  },
  {
    "id": "nzbget",
    "name": "NZBGet",
    "category": "Downloads",
    "tags": [
      "usenet",
      "downloads",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "NZBGet is a lightweight, high-performance Usenet (NZB) downloader written in C++. It downloads, verifies, repairs, and unpacks NZBs with very low resource usage and integrates with the \\*arr apps — an efficient alternative to SABnzbd.",
    "officialUrl": "https://nzbget.com",
    "polling": "adaptive",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:6789",
    "gettingKey": "NZBGet → **Settings → Security** → note or set your **Control username** and **Control password** (default `nzbget:tegbzn6789` — change it before exposing the port). Combine as `username:password`.\n\n- **Secret format:** `username:password`\n- **URL:** required — point at your NZBGet port, e.g. `http://192.168.1.10:6789`"
  },
  {
    "id": "qbittorrent",
    "name": "qBittorrent",
    "category": "Downloads",
    "tags": [
      "torrent",
      "downloads",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "qBittorrent is a free, open-source BitTorrent client with a full-featured web UI, built-in search, RSS auto-downloading, and no ads. A popular open alternative to older clients, it's frequently run headless on a server.",
    "officialUrl": "https://www.qbittorrent.org",
    "polling": "30s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8080",
    "gettingKey": "- **API key (qBittorrent 5.2.0+, recommended):** Preferences → Web UI → API Key → **Generate**. The key starts with `qbt_`. Paste it alone (no colon) — it's sent as `Authorization: Bearer <key>`, no login session needed.\n- **Username:password:** your qBittorrent WebUI credentials (default `admin:adminadmin` — change it). Stoa logs in via `/api/v2/auth/login` and caches the session cookie.\n\n- **Secret format:** API key (recommended) or `username:password`\n- **URL:** required — point at your qBittorrent port, e.g. `http://192.168.1.10:8080`"
  },
  {
    "id": "rutorrent",
    "name": "ruTorrent",
    "category": "Downloads",
    "tags": [
      "torrent",
      "downloads",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "ruTorrent is a feature-rich web front end for the rTorrent BitTorrent client. It adds a full browser UI — plugins, RSS, scheduling, and stats — on top of rTorrent's lightweight daemon, and is a long-standing choice for seedboxes.",
    "officialUrl": "https://github.com/Novik/ruTorrent",
    "polling": "30s",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8080",
    "gettingKey": "Use your ruTorrent HTTP Basic Auth credentials in `username:password` form. Leave blank only if ruTorrent has no authentication (not recommended for network-accessible instances). ruTorrent has no API-key system — auth is handled at the web-server level (nginx/Apache/lighttpd), not inside ruTorrent.\n\n- **Secret format:** `username:password` or blank\n- **URL:** required — your ruTorrent web root, e.g. `http://192.168.1.10:8080`"
  },
  {
    "id": "sabnzbd",
    "name": "SABnzbd",
    "category": "Downloads",
    "tags": [
      "usenet",
      "downloads",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "SABnzbd is a free, open-source Usenet (NZB) downloader. It automates fetching, verifying (par2), repairing, and unpacking Usenet downloads and integrates with the \\*arr apps and indexers — the Usenet counterpart to a torrent client.",
    "officialUrl": "https://sabnzbd.org",
    "polling": "adaptive",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8080",
    "gettingKey": "SABnzbd → **Config → General → API Key** — copy the full key (typically 32 hex characters). Paste it alone — no username, no colon.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your SABnzbd port, e.g. `http://192.168.1.10:8080`"
  },
  {
    "id": "transmission",
    "name": "Transmission",
    "category": "Downloads",
    "tags": [
      "torrent",
      "downloads",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Transmission is a lightweight, open-source BitTorrent client known for a minimal, no-frills interface and low resource use. It offers a web UI and an RPC API for remote control, making it a common choice for headless/server torrent downloading.",
    "officialUrl": "https://transmissionbt.com",
    "polling": "30s",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:9091",
    "gettingKey": "Use your Transmission Web UI credentials in `username:password` form. Leave blank if authentication is disabled (`rpc-authentication-required: false`).\n\n- **Secret format:** `username:password` or blank\n- **URL:** required — point at your Transmission port, e.g. `http://192.168.1.10:9091`"
  },
  {
    "id": "audiobookshelf",
    "name": "Audiobookshelf",
    "category": "Print Media",
    "tags": [
      "audiobooks",
      "books",
      "streaming",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Audiobookshelf is a self-hosted server for audiobooks, podcasts, and ebooks. It organizes your library, tracks listening and reading progress per user across devices, streams to its own web and mobile apps, and can subscribe to and automatically download podcasts.",
    "officialUrl": "https://www.audiobookshelf.org",
    "polling": "60s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:13378",
    "gettingKey": "ABS → **Settings → Users → your user → API Token** — copy it. For root accounts you can instead use `username:password` (e.g. `root:yourpassword`).\n\n- **Secret format:** API token, or `username:password`\n- **URL:** required — point at your ABS port, e.g. `http://192.168.1.10:13378`. If ABS is served under a sub-path (reverse proxy), include it: `http://192.168.1.10:13378/audiobookshelf`"
  },
  {
    "id": "kapowarr",
    "name": "Kapowarr",
    "category": "Print Media",
    "tags": [
      "comics",
      "downloads",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Kapowarr is a self-hosted manager and downloader for Western comic-book volumes. It builds and monitors your digital comic library, grabs missing issues, and organizes them with metadata and covers — a modern take on automated comic collecting.",
    "officialUrl": "https://github.com/Casvt/Kapowarr",
    "polling": "30min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://kapowarr:5656",
    "gettingKey": "Kapowarr → **Settings → API Key** — copy it.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Kapowarr port, e.g. `http://kapowarr:5656`"
  },
  {
    "id": "kavita",
    "name": "Kavita",
    "category": "Print Media",
    "tags": [
      "books",
      "comics",
      "manga",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Kavita is a self-hosted digital library and reader for manga, comics, ebooks, and other digital books. It scans your collection, organizes it into libraries and series with cover art and metadata, and provides fast in-browser readers for each format — a lightweight, single-binary way to run your own reading server.",
    "officialUrl": "https://www.kavitareader.com",
    "polling": "30min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:5000",
    "gettingKey": "Kavita → your username (top-right) → **User Settings → API Key** (any account works — admin not required) — copy it.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Kavita port, e.g. `http://192.168.1.10:5000`"
  },
  {
    "id": "komga",
    "name": "Komga",
    "category": "Print Media",
    "tags": [
      "comics",
      "manga",
      "books",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Komga is a self-hosted media server for comics, manga, and digital books. It organizes your CBZ/CBR/PDF/EPUB collection into libraries and series with metadata and cover art, and serves them to its own web reader as well as third-party reader apps via its REST API and OPDS feed.",
    "officialUrl": "https://komga.org",
    "polling": "30min",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8080",
    "gettingKey": "Use your Komga login credentials in `username:password` form, or generate an API key at Komga → **Settings → API Keys**.\n\n- **Secret format:** `username:password` or plain API key\n- **URL:** required — point at your Komga port, e.g. `http://192.168.1.10:8080`"
  },
  {
    "id": "mylar3",
    "name": "Mylar3",
    "category": "Print Media",
    "tags": [
      "comics",
      "downloads",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Mylar3 is a self-hosted automated downloader and manager for Western comics. It tracks the comic series you follow, watches for new and missing issues from your sources, downloads them, and organizes your collection with metadata and covers — the \"\\*arr\" of comics.",
    "officialUrl": "https://github.com/mylar3/mylar3",
    "polling": "30min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://mylar3:8090",
    "gettingKey": "Mylar3 → **Settings → Web Interface → Enable API** → copy the **API Key**.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your Mylar3 port, e.g. `http://mylar3:8090`"
  },
  {
    "id": "tranga",
    "name": "Tranga",
    "category": "Print Media",
    "tags": [
      "manga",
      "downloads",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Tranga is a self-hosted manga downloader. It monitors manga series across supported sources, automatically downloads new chapters, and organizes your library with covers and publication status.",
    "officialUrl": "https://github.com/C9Glax/tranga",
    "polling": "30min",
    "secretFormat": "none",
    "urlRequired": true,
    "exampleUrl": "http://tranga:9898",
    "gettingKey": "None by default — Tranga runs unauthenticated. Leave the secret blank. If you've configured an API key in Tranga (optional), paste it.\n\n- **Secret format:** none (or an optional API key)\n- **URL:** required — point at your Tranga port, e.g. `http://tranga:9898`"
  },
  {
    "id": "lastfm",
    "name": "Last.fm",
    "category": "Music",
    "tags": [
      "music",
      "cloud"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Last.fm is a music-tracking service that \"scrobbles\" (logs) the songs you play from Spotify, your local player, and many other sources, building a history and charts of your listening. Stoa reads it via the free public API — a no-Premium alternative to the Spotify integration.",
    "officialUrl": "https://www.last.fm",
    "polling": "30s",
    "secretFormat": "composite",
    "urlRequired": false,
    "gettingKey": "Log in to Last.fm, go to [last.fm/api](https://www.last.fm/api) → **Get an API account**, fill in any name/description (leave Callback URL blank), and copy the **API key** shown on the next page (you don't need the Shared Secret). Combine with your username.\n\n- **Secret format:** `username:apiKey`\n- **URL:** none — Last.fm's public API\n\n> **Connect Spotify for scrobbling:** In Last.fm → Settings → Music Services → Spotify → Connect. From then on, everything you play on Spotify is recorded automatically, and the panel updates within seconds of a track starting."
  },
  {
    "id": "navidrome",
    "name": "Navidrome",
    "category": "Music",
    "tags": [
      "music",
      "streaming",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Navidrome is a self-hosted music streaming server compatible with the Subsonic / OpenSubsonic API. It indexes your personal music collection and streams it to its own web UI and to dozens of third-party Subsonic-compatible apps, with playlists, favorites, and per-user libraries — a self-hosted alternative to Spotify for music you own.",
    "officialUrl": "https://www.navidrome.org",
    "polling": "30s",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:4533",
    "gettingKey": "Use your Navidrome **local account** credentials in `username:password` form — **not** your OIDC/SSO provider credentials (see the OIDC note below).\n\n- **Secret format:** `username:password`\n- **URL:** required — point at your Navidrome port, e.g. `http://192.168.1.10:4533`"
  },
  {
    "id": "plexmusic",
    "name": "Plex Music",
    "category": "Music",
    "tags": [
      "music",
      "plex",
      "personal",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "A personal companion to Stoa's system-wide Plex integration — instead of showing server-wide sessions and video libraries, this connects **as an individual household member** and gives them a real in-panel music player: pick a playlist, see the track list, and play it right there in the browser (like the Navidrome panel). It also shows their music library stats, what's currently playing on their other Plex sessions, and — as a bonus — their personal Plex Watchlist (movies/TV saved to watch later). Each person in your household can have their own Plex Music integration and panel, isolated from everyone else's.\n\nThis exists because Stoa's main Plex integration is deliberately system/shared and video-focused — it has no concept of \"whose session is this\" beyond display, and nothing music-specific. Standing up Navidrome as a separate music server was considered and passed on; Plex + Plexamp already covers day-to-day listening well, so this fills the one real gap (per-user, personal views) without running a second service.\n\n**v1 scope: Home users only.** Plex Home members (family profiles on your server without their own separate plex.tv email login) connect via an admin-mediated flow described below. External users you've shared libraries with (real, independent plex.tv accounts) aren't supported yet — that's a different, self-service auth flow (PIN-link OAuth) that's a natural v2 addition in the same architectural slot, just deferred to keep this release scoped.",
    "officialUrl": "https://www.plex.tv",
    "polling": "30s",
    "secretFormat": "none",
    "urlRequired": false,
    "exampleUrl": "\"\""
  },
  {
    "id": "spotify",
    "name": "Spotify",
    "category": "Music",
    "tags": [
      "music",
      "streaming",
      "cloud",
      "oauth"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "Spotify is the leading music-streaming service. Its Web API exposes what you're currently playing, recently played, and your top tracks/artists — which is what Stoa's now-playing panel shows after you connect via OAuth.\n\n> **Spotify Premium required.** The Spotify Web API — which powers all data in this panel (now playing, recently played, top tracks) — is only available to Spotify Premium subscribers for new developer apps. Free-tier accounts will see the Web API option greyed out in the Spotify Developer Dashboard. If you have Spotify Free, [Last.fm](../lastfm/) is a practical alternative that shows the same data via scrobbling.",
    "officialUrl": "https://www.spotify.com",
    "polling": "30s",
    "secretFormat": "oauth",
    "urlRequired": false,
    "gettingKey": "Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) (Premium required), enable **Web API**, and add your Stoa callback as a redirect URI. Copy the **Client ID** and **Client Secret**.\n\n- **Secret format:** `clientId:clientSecret`\n- **URL:** none — OAuth against Spotify's cloud API\n\n> Spotify requires **HTTPS** for all redirect URIs except `http://localhost`. If you access Stoa via a plain IP on HTTP, the OAuth flow will fail — a reverse proxy with TLS termination is required. The exact redirect URI to register is shown on the integration edit page (`https://your-stoa-hostname/api/spotify/callback`)."
  },
  {
    "id": "pterodactyl",
    "name": "Pterodactyl",
    "category": "Gaming",
    "tags": [
      "gaming",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "Pterodactyl is an open-source game-server management panel. It runs game servers in isolated Docker containers and gives admins and users a web UI to deploy, control, and monitor them, with resource limits and multi-node support.",
    "officialUrl": "https://pterodactyl.io",
    "polling": "60s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10",
    "gettingKey": "Pterodactyl → **Account** (top right) → **API Credentials → Create API Key**. Use the **client** key (`ptlc_…`), not the admin key.\n\n- **Secret format:** client API key (Bearer)\n- **URL:** required — point at your Pterodactyl panel, e.g. `http://192.168.1.10`"
  },
  {
    "id": "romm",
    "name": "RomM",
    "category": "Gaming",
    "tags": [
      "gaming",
      "roms",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "RomM (ROM Manager) is a self-hosted app for organizing and browsing a retro-game ROM collection. It scans your library, enriches it with metadata and box art from external sources, and provides a web UI — including in-browser play — across many platforms.",
    "officialUrl": "https://romm.app",
    "polling": "15min",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8080",
    "gettingKey": "Use your RomM login in `username:password` form, or an API/Bearer token if you've configured one.\n\n- **Secret format:** `username:password` or Bearer token\n- **URL:** required — point at your RomM port, e.g. `http://192.168.1.10:8080`"
  },
  {
    "id": "steam",
    "name": "Steam",
    "category": "Gaming",
    "tags": [
      "gaming",
      "cloud"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Steam is Valve's digital game-distribution platform — the largest PC gaming store and library manager. Its Web API exposes your public profile, owned games, playtime, achievements, and online status, which is what Stoa reads to build the panel.",
    "officialUrl": "https://store.steampowered.com",
    "polling": "5min",
    "secretFormat": "api-key",
    "urlRequired": false,
    "gettingKey": "Register a free Steam Web API key at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey). You'll also need your **Steam ID64** (from your profile URL or steamid.io), which is entered in the integration settings.\n\n- **Secret format:** Steam Web API key\n- **URL:** none — Stoa calls the Steam API directly. Your Steam ID64 is configured in the integration form."
  },
  {
    "id": "nextcloud",
    "name": "Nextcloud",
    "category": "Storage & Virtualization",
    "tags": [
      "storage",
      "files",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Nextcloud is a self-hosted file-sync and collaboration platform — a private alternative to Dropbox and Google Workspace. It stores and syncs your files across devices and adds calendars, contacts, document editing, and much more through its app ecosystem, all running on your own server.",
    "officialUrl": "https://nextcloud.com",
    "polling": "5min",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "https://cloud.example.com",
    "gettingKey": "In Nextcloud → **Settings → Security → Devices & sessions** → scroll to the bottom → enter a name (e.g. \"Stoa\") → **Create new app password**. Copy it — it's shown only once. Combine with your username: `yourusername:apppassword`.\n\n- **Secret format:** `username:password` — use an **app password**. If your username contains `@` (a UPN from SAML/SSO), that's fine; Stoa splits on the first colon only.\n- **URL:** required — your Nextcloud base URL, e.g. `https://cloud.example.com`\n\n> **App passwords bypass SAML / SSO.** If your Nextcloud login goes through an identity provider (Keycloak, Authentik, LDAP, etc.), app passwords are the correct credential type — they authenticate directly against Nextcloud.\n\n> **Admin account required for server stats.** RAM usage and server info come from Nextcloud's **Monitoring** app endpoint (install via Apps → Tools → Monitoring) and require admin credentials. A non-admin account still shows user and file counts, but server stats are absent."
  },
  {
    "id": "omv",
    "name": "OpenMediaVault",
    "category": "Storage & Virtualization",
    "tags": [
      "nas",
      "storage",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "OpenMediaVault (OMV) is a free, Debian-based NAS operating system. It provides a web interface for managing disks, filesystems, and network shares (SMB/NFS/FTP and more), with a plugin system for extra services — a lightweight, fully open-source way to build a home NAS.",
    "officialUrl": "https://www.openmediavault.org",
    "polling": "30s",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10",
    "gettingKey": "Use your OMV WebUI login in `username:password` form (e.g. `admin:yourpassword`).\n\n- **Secret format:** `username:password`\n- **URL:** required — point at your OMV host, e.g. `http://192.168.1.10`"
  },
  {
    "id": "proxmox",
    "name": "Proxmox",
    "category": "Storage & Virtualization",
    "tags": [
      "virtualization",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Proxmox VE (Virtual Environment) is an open-source virtualization platform that combines KVM virtual machines and LXC containers under one web interface, with clustering, live migration, software-defined storage, and integrated backups — a self-hosted alternative to VMware ESXi.",
    "officialUrl": "https://www.proxmox.com",
    "polling": "30s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "https://192.168.1.10:8006",
    "gettingKey": "Proxmox → **Datacenter → Permissions → API Tokens → Add Token** (assign the Viewer role, or disable Privilege Separation). Use the full token string.\n\n- **Secret format:** `user@realm!tokenid:secret` — e.g. `root@pam!stoa:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`\n- **URL:** required, HTTPS — e.g. `https://192.168.1.10:8006`"
  },
  {
    "id": "qnap",
    "name": "QNAP QTS",
    "category": "Storage & Virtualization",
    "tags": [
      "nas",
      "storage"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "QNAP QTS is the operating system that runs on QNAP NAS appliances. It manages storage volumes and RAID, serves network shares, and runs a broad app catalog — multimedia, backup, virtualization, and containers — through its web-based desktop.",
    "officialUrl": "https://www.qnap.com",
    "polling": "30s",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8080",
    "gettingKey": "Use your QNAP WebUI login in `username:password` form (e.g. `admin:yourpassword`).\n\n- **Secret format:** `username:password`\n- **URL:** required — point at your QNAP host, e.g. `http://192.168.1.10:8080`"
  },
  {
    "id": "scrutiny",
    "name": "Scrutiny",
    "category": "Storage & Virtualization",
    "tags": [
      "storage",
      "monitoring",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "Scrutiny is a self-hosted dashboard for hard-drive SMART health. It collects SMART attributes from your disks, tracks temperature and error trends over time, and warns before a drive fails — wrapping the raw `smartd` data in a clean web UI so you can spot a dying disk early.",
    "officialUrl": "https://github.com/AnalogJ/scrutiny",
    "polling": "5min",
    "secretFormat": "none",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8080",
    "gettingKey": "None — Scrutiny runs unauthenticated by default. Leave the secret blank.\n\n- **Secret format:** none (leave blank)\n- **URL:** required — point at your Scrutiny port, e.g. `http://192.168.1.10:8080`"
  },
  {
    "id": "synology",
    "name": "Synology DSM",
    "category": "Storage & Virtualization",
    "tags": [
      "nas",
      "storage"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "Synology DiskStation Manager (DSM) is the operating system that runs on Synology NAS appliances. It manages storage volumes and RAID, serves files over SMB/NFS/AFP, and runs a large ecosystem of first-party apps (Photos, Drive, Surveillance Station, and more) through a polished web-based desktop.",
    "officialUrl": "https://www.synology.com",
    "polling": "30s",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:5000",
    "gettingKey": "Use your Synology DSM login in `username:password` form (e.g. `admin:yourpassword`). A dedicated read-only account is recommended.\n\n- **Secret format:** `username:password`\n- **URL:** required — point at your DSM port, e.g. `http://192.168.1.10:5000`"
  },
  {
    "id": "truenas",
    "name": "TrueNAS",
    "category": "Storage & Virtualization",
    "tags": [
      "nas",
      "storage",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "TrueNAS is an open-source storage operating system built on ZFS. It turns a dedicated machine into a NAS/SAN — managing pools of disks with snapshots, replication, and end-to-end data-integrity checks — and layers on file sharing (SMB/NFS/iSCSI) plus apps and VMs. It ships in two editions: SCALE (Linux-based) and CORE (FreeBSD-based).",
    "officialUrl": "https://www.truenas.com",
    "polling": "30s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10",
    "gettingKey": "TrueNAS → **Credentials → API Keys → Add** — copy the key.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your TrueNAS host, e.g. `http://192.168.1.10`"
  },
  {
    "id": "unraid",
    "name": "Unraid",
    "category": "Storage & Virtualization",
    "tags": [
      "nas",
      "storage",
      "virtualization",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "Unraid is a NAS and application-server operating system built around a flexible, parity-protected array that lets you mix drive sizes and expand one disk at a time. Beyond storage it runs Docker containers and virtual machines, which makes it a popular all-in-one home-server OS.",
    "officialUrl": "https://unraid.net",
    "polling": "30s",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10",
    "gettingKey": "Use your Unraid WebUI login in `username:password` form (e.g. `root:yourpassword`).\n\n- **Secret format:** `username:password`\n- **URL:** required — point at your Unraid host, e.g. `http://192.168.1.10`"
  },
  {
    "id": "adguard",
    "name": "AdGuard Home",
    "category": "Network & Security",
    "tags": [
      "dns",
      "adblock",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "AdGuard Home is a self-hosted, network-wide DNS blocker for ads and trackers — a Pi-hole alternative. It runs as your network's DNS server, filtering ad, tracker, and malware domains for all connected devices, and offers per-client rules, encrypted DNS (DoH/DoT), and query analytics.",
    "officialUrl": "https://github.com/AdguardTeam/AdGuardHome",
    "polling": "30s",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:3000",
    "gettingKey": "Use your AdGuard Home web-UI login credentials in `username:password` form (e.g. `admin:yourpassword`). The same credentials that log into the web UI grant API access — no extra setup needed.\n\n- **Secret format:** `username:password`\n- **URL:** required — point directly at the AdGuard Home web UI/API port, e.g. `http://192.168.1.10:3000`"
  },
  {
    "id": "authentik",
    "name": "Authentik",
    "category": "Network & Security",
    "tags": [
      "sso",
      "identity",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Authentik is a self-hosted identity provider and single-sign-on (SSO) server. It centralizes authentication for your apps via SAML, OAuth2/OpenID Connect, LDAP, and more, with flexible login flows, MFA, and user management — an open-source alternative to Okta and Auth0.",
    "officialUrl": "https://goauthentik.io",
    "polling": "5min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "https://auth.example.com",
    "gettingKey": "Authentik → **Admin interface → System → API Tokens → Create** — copy the token.\n\n- **Secret format:** API token\n- **URL:** required — your Authentik base URL, e.g. `https://auth.example.com`"
  },
  {
    "id": "cloudflare",
    "name": "Cloudflare",
    "category": "Network & Security",
    "tags": [
      "dns",
      "proxy",
      "cloud"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "Cloudflare is a global network that sits in front of your websites and services, providing DNS, CDN caching, DDoS protection, a web application firewall, and Zero Trust tunnels. In Stoa the integration reads your zone analytics and Cloudflare Tunnel health through the Cloudflare API.",
    "officialUrl": "https://www.cloudflare.com",
    "polling": "5min",
    "secretFormat": "api-key",
    "urlRequired": false,
    "gettingKey": "Recommended: Cloudflare → **Profile → API Tokens → Create Token** with **Zone:Read + Analytics:Read + Tunnel:Read**. Legacy: your account email + global API key, colon-separated.\n\n- **Secret format:** scoped API token (recommended) or `email:globalApiKey` (legacy)\n- **URL:** none — Stoa calls the Cloudflare cloud API directly"
  },
  {
    "id": "gluetun",
    "name": "Gluetun",
    "category": "Network & Security",
    "tags": [
      "vpn",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Gluetun is a lightweight VPN client that runs in a Docker container. You route other containers' traffic through it so their internet access always goes over a commercial VPN — with a built-in kill switch — and it exposes a small control server reporting VPN status, public IP, and forwarded ports. It's most commonly used to keep download clients behind a VPN.",
    "officialUrl": "https://github.com/qdm12/gluetun",
    "polling": "60s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8000",
    "gettingKey": "Gluetun exposes a control server on port 8000 by default. **Gluetun v3.40+** requires an API key for the restricted routes (`/v1/publicip/ip`, `/v1/vpn/settings`) — without one the panel shows only VPN status and forwarded port. Create an auth role by mounting a file at `/gluetun/auth/config.toml` inside the container:\n\n```toml\n[[roles]]\nname = \"stoa\"\nauth = \"apikey\"\napikey = \"your-long-random-key\"\nroutes = [\n  \"GET /v1/publicip/ip\",\n  \"GET /v1/vpn/settings\",\n  \"GET /v1/vpn/status\",\n  \"GET /v1/openvpn/status\",\n  \"GET /v1/openvpn/portforwarded\",\n  \"GET /v1/portforward\",\n]\n```\n\nRestart Gluetun after adding it. (Generate a key with e.g. `openssl rand -hex 24`.)\n\n- **Secret format:** control-server API key (blank works only on pre-3.40 Gluetun)\n- **URL:** required — point at the control server, e.g. `http://192.168.1.10:8000`"
  },
  {
    "id": "grafana",
    "name": "Grafana",
    "category": "Network & Security",
    "tags": [
      "monitoring",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Grafana is an open-source observability and dashboarding platform. It connects to data sources like Prometheus, Loki, and InfluxDB and turns their metrics and logs into visual dashboards, with alerting and a large plugin ecosystem — the visualization layer that commonly pairs with Prometheus.",
    "officialUrl": "https://grafana.com",
    "polling": "60s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:3000",
    "gettingKey": "Grafana → **Administration → Service Accounts → Add service account → Add token** (starts with `glsa_`). Assign the **Viewer** role for datasource/alert data, or **Admin** for dashboard and user counts.\n\n- **Secret format:** Service Account token (`glsa_...`)\n- **URL:** required — point at your Grafana port, e.g. `http://192.168.1.10:3000`"
  },
  {
    "id": "keycloak",
    "name": "Keycloak",
    "category": "Network & Security",
    "tags": [
      "sso",
      "identity",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Keycloak is an open-source identity and access management server. It provides single sign-on, user federation, and standards-based authentication (OpenID Connect, OAuth2, SAML) for your applications, organized into realms with clients, roles, and MFA — a widely used, enterprise-grade SSO platform.",
    "officialUrl": "https://www.keycloak.org",
    "polling": "5min",
    "secretFormat": "composite",
    "urlRequired": true,
    "exampleUrl": "https://auth.example.com",
    "gettingKey": "Create a confidential client with a service account, and enable event saving:\n\n1. Keycloak → your realm → **Realm settings → Events** → enable **Save events** (off by default — the events endpoint stays empty otherwise).\n2. Keycloak → your realm → **Clients → Create client** → enable **Client authentication** (confidential) and **Service accounts roles**.\n3. Client → **Service accounts roles → Assign role** → filter by `realm-management` → assign **view-events** and **query-users**.\n4. Client → **Credentials** tab → copy the client secret.\n\n- **Secret format:** `realm:clientId:clientSecret` (e.g. `master:stoa:abc123...`)\n- **URL:** required — your Keycloak base URL, e.g. `https://auth.example.com`"
  },
  {
    "id": "netbird",
    "name": "Netbird",
    "category": "Network & Security",
    "tags": [
      "vpn",
      "mesh",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "NetBird is an open-source, self-hostable mesh VPN built on WireGuard — a Tailscale-style overlay network. It connects your machines into a secure peer-to-peer network with a central management plane for peers, groups, and access policies, available either as a hosted cloud service or fully self-hosted.",
    "officialUrl": "https://netbird.io",
    "polling": "60s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "https://api.netbird.io",
    "gettingKey": "NetBird → **Settings → Personal Access Tokens → Create** — copy the token.\n\n- **Secret format:** Personal Access Token (PAT)\n- **URL:** required — `https://api.netbird.io` for cloud, or your management URL for self-hosted"
  },
  {
    "id": "nextdns",
    "name": "NextDNS",
    "category": "Network & Security",
    "tags": [
      "dns",
      "adblock",
      "cloud"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "NextDNS is a cloud-based DNS resolver that blocks ads, trackers, and malware and enforces filtering and parental-control policies at the DNS level — the cloud counterpart to Pi-hole and AdGuard Home. In Stoa the integration reads your profile's query analytics through the NextDNS API.",
    "officialUrl": "https://nextdns.io",
    "polling": "30s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "https://api.nextdns.io/profiles/{profileId}",
    "gettingKey": "NextDNS → **Account → API Key** — copy it. Find your Profile ID in the NextDNS dashboard URL, and build the API URL from it.\n\n- **Secret format:** plain API key\n- **URL:** required — your profile API endpoint, `https://api.nextdns.io/profiles/{profileId}`"
  },
  {
    "id": "nginxpm",
    "name": "Nginx Proxy Manager",
    "category": "Network & Security",
    "tags": [
      "proxy",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Nginx Proxy Manager (NPM) is a web UI on top of nginx for running a reverse proxy without editing config files. You point domains at your internal services, and it manages the nginx configuration and free Let's Encrypt TLS certificates for you — a beginner-friendly way to expose homelab apps over HTTPS.",
    "officialUrl": "https://nginxproxymanager.com",
    "polling": "60s",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:81",
    "gettingKey": "Use your NPM web-UI login, colon-separated as `email:password` (e.g. `admin@example.com:yourpassword`). Stoa exchanges these for a session token via NPM's `/api/tokens` endpoint automatically — no separate API key needed.\n\n- **Secret format:** `email:password`\n- **URL:** required — your NPM base URL including port, e.g. `http://192.168.1.10:81`"
  },
  {
    "id": "omada",
    "name": "Omada SDN",
    "category": "Network & Security",
    "tags": [
      "network",
      "wifi"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "TP-Link Omada is a software-defined networking (SDN) controller for TP-Link's Omada line of access points, switches, and gateways. It centralizes management, monitoring, and configuration of that hardware across one or more sites from a single controller — a self-hostable alternative to per-device management.",
    "officialUrl": "https://www.omadanetworks.com",
    "polling": "30s",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "https://192.168.1.10:8043",
    "gettingKey": "Use your Omada controller login in `username:password` form. Requires Omada **5.0+** with the Open API (v2) enabled in controller settings.\n\n- **Secret format:** `username:password`\n- **URL:** required, HTTPS — e.g. `https://192.168.1.10:8043`"
  },
  {
    "id": "openwrt",
    "name": "OpenWrt",
    "category": "Network & Security",
    "tags": [
      "router",
      "firewall",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "OpenWrt is an open-source Linux operating system for routers and other network devices. It replaces stock vendor firmware with a fully configurable system — advanced networking, a package manager, and the LuCI web interface — giving you deep control over routing, WiFi, firewall, and network services.",
    "officialUrl": "https://openwrt.org",
    "polling": "5s",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.1",
    "gettingKey": "Use your OpenWrt login in `username:password` form. The default username is `root`.\n\n- **Secret format:** `username:password` (e.g. `root:yourpassword`)\n- **URL:** required — point at your router, e.g. `http://192.168.1.1`"
  },
  {
    "id": "opnsense",
    "name": "OPNsense",
    "category": "Network & Security",
    "tags": [
      "firewall",
      "router",
      "vpn",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "OPNsense is an open-source, FreeBSD-based firewall and routing platform. It handles perimeter firewalling, VPNs, traffic shaping, and intrusion detection through a web UI, and is a popular open alternative to commercial firewall appliances (and a fork-sibling of pfSense).",
    "officialUrl": "https://opnsense.org",
    "polling": "30s",
    "secretFormat": "composite",
    "urlRequired": true,
    "exampleUrl": "https://192.168.1.1",
    "gettingKey": "OPNsense → **System → Access → Users** → edit your API user → **+ New API Key**. You get a key + secret pair — join them with a colon.\n\n- **Secret format:** `key:secret` (colon-separated)\n- **URL:** required, HTTPS — e.g. `https://192.168.1.1`"
  },
  {
    "id": "pfsense",
    "name": "pfSense",
    "category": "Network & Security",
    "tags": [
      "firewall",
      "router",
      "vpn",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "pfSense is an open-source, FreeBSD-based firewall and router platform. It provides stateful firewalling, VPNs (OpenVPN, IPsec, WireGuard), traffic shaping, and a large package ecosystem through a web UI — one of the most widely deployed open-source perimeter firewalls.",
    "officialUrl": "https://www.pfsense.org",
    "polling": "5s",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "https://192.168.1.1",
    "gettingKey": "Install the **pfSense-pkg-API** package (System → Package Manager), then use your pfSense WebUI login in `username:password` form.\n\n- **Secret format:** `username:password` — requires the pfSense-pkg-API package\n- **URL:** required, HTTPS — e.g. `https://192.168.1.1`"
  },
  {
    "id": "pihole",
    "name": "Pi-hole",
    "category": "Network & Security",
    "tags": [
      "dns",
      "adblock",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Pi-hole is a self-hosted, network-wide DNS ad and tracker blocker. It acts as your LAN's DNS resolver, blocking requests to known ad, tracking, and malware domains for every device on the network — no per-device software required — and reports on exactly what it blocked.",
    "officialUrl": "https://pi-hole.net",
    "polling": "30s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10",
    "gettingKey": "- **v5:** Pi-hole → **Settings → API / Web interface → Show API token** — copy it.\n- **v6:** use your Pi-hole web-UI password (or an app password).\n\nStoa auto-detects the Pi-hole version at connection time.\n\n- **Secret format:** API token (v5) or web password (v6)\n- **URL:** required — point at your Pi-hole, e.g. `http://192.168.1.10`"
  },
  {
    "id": "prometheus",
    "name": "Prometheus",
    "category": "Network & Security",
    "tags": [
      "monitoring",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Prometheus is an open-source monitoring system and time-series database. It scrapes metrics from your applications and hosts at intervals, stores them, and lets you query them with PromQL and alert on them — the de facto standard for metrics in cloud-native and homelab setups.",
    "officialUrl": "https://prometheus.io",
    "polling": "30s",
    "secretFormat": "none",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:9090",
    "gettingKey": "Most homelab Prometheus instances run open (no auth) — leave the secret blank. If you added auth via a reverse proxy, use the matching format.\n\n- **Secret format:** blank (open), `username:password` (Basic Auth), or a bare Bearer token\n- **URL:** required — point at your Prometheus port, e.g. `http://192.168.1.10:9090`"
  },
  {
    "id": "tailscale",
    "name": "Tailscale",
    "category": "Network & Security",
    "tags": [
      "vpn",
      "mesh"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Tailscale is a mesh VPN built on WireGuard that connects your devices into a private network (a \"tailnet\") with almost no configuration. Devices authenticate through your identity provider and reach each other directly wherever they are, with features like subnet routers, exit nodes, and MagicDNS.",
    "officialUrl": "https://tailscale.com",
    "polling": "60s",
    "secretFormat": "api-key",
    "urlRequired": false,
    "gettingKey": "Tailscale admin console → **Settings → Keys → Generate access token**. The token starts with `tskey-api-`.\n\n- **Secret format:** API token (`tskey-api-...`)\n- **URL:** none — leave blank to use your default tailnet. If you have a named tailnet (e.g. `yourorg.github`), enter just the tailnet name (not a full URL)."
  },
  {
    "id": "traefik",
    "name": "Traefik",
    "category": "Network & Security",
    "tags": [
      "proxy",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "Traefik is a modern, cloud-native reverse proxy and load balancer. It automatically discovers your services (Docker, Kubernetes, and more) and routes incoming traffic to them, handling TLS certificates, middleware, and load balancing with minimal manual configuration — a popular front end for containerized homelab services.",
    "officialUrl": "https://traefik.io",
    "polling": "30s",
    "secretFormat": "none",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8080",
    "gettingKey": "Most homelab Traefik dashboards run open (no auth) — leave the secret blank. If you've added Basic Auth or a Bearer token, use that. The Traefik API must be enabled (`--api=true`).\n\n- **Secret format:** blank (open), `username:password` (Basic Auth), or a bare Bearer token\n- **URL:** required — point at your Traefik dashboard/API, e.g. `http://192.168.1.10:8080`"
  },
  {
    "id": "unifi",
    "name": "UniFi",
    "category": "Network & Security",
    "tags": [
      "network",
      "wifi"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "Ubiquiti UniFi is a networking platform managed by the UniFi Network Application (controller). It centrally configures and monitors UniFi access points, switches, and gateways — clients, WiFi, WAN health, and events — across your whole network from one console.",
    "officialUrl": "https://ui.com",
    "polling": "30s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "https://192.168.1.10",
    "gettingKey": "On UniFi v9.3.43+: **Settings → Control Plane → Integrations → API Keys → Create**. On older versions, use the `username:password` of an admin account.\n\n- **Secret format:** plain API key (v9.3.43+) or `username:password` (legacy)\n- **URL:** required, HTTPS — e.g. `https://192.168.1.10`"
  },
  {
    "id": "kuma",
    "name": "Uptime Kuma",
    "category": "Network & Security",
    "tags": [
      "monitoring",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Uptime Kuma is a self-hosted uptime monitoring tool — a lightweight, open-source alternative to services like UptimeRobot. It periodically checks your websites, services, and hosts (HTTP, TCP, ping, DNS, and more), tracks response times and uptime percentages, and can notify you the moment something goes down.",
    "officialUrl": "https://github.com/louislam/uptime-kuma",
    "polling": "60s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:3001",
    "gettingKey": "Kuma 1.23+: **Settings → API Keys → Add**. Older versions run without auth — leave the secret blank.\n\n- **Secret format:** plain API key (Kuma 1.23+), or blank for older versions\n- **URL:** required — point at your Kuma port, e.g. `http://192.168.1.10:3001`"
  },
  {
    "id": "wgeasy",
    "name": "wg-easy",
    "category": "Network & Security",
    "tags": [
      "vpn",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "wg-easy is the easiest way to run your own WireGuard VPN server. It wraps WireGuard in a simple web UI for creating and managing client configs (with QR codes for phones), so you can set up secure remote access to your home network without hand-editing WireGuard config files.",
    "officialUrl": "https://github.com/wg-easy/wg-easy",
    "polling": "30s",
    "secretFormat": "password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:51821",
    "gettingKey": "Use your wg-easy web-UI password (bare — no username). Leave the secret blank for a no-auth instance.\n\n- **Secret format:** bare password (no username)\n- **URL:** required — point at your wg-easy port, e.g. `http://192.168.1.10:51821`"
  },
  {
    "id": "actualbudget",
    "name": "Actual Budget",
    "category": "Finance",
    "tags": [
      "finance",
      "budgeting",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Actual Budget is a self-hosted, privacy-focused envelope-budgeting app. It uses zero-based budgeting (give every dollar a job) with fast, local-first sync across devices, tracking accounts, categories, and scheduled transactions — an open-source take on YNAB-style budgeting.",
    "officialUrl": "https://actualbudget.org",
    "polling": "5min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:3000",
    "gettingKey": "Actual Budget has no HTTP API of its own — Stoa connects through the unofficial [jhonderson/actual-http-api](https://github.com/jhonderson/actual-http-api) sidecar, which wraps Actual's Node API as REST. You choose the sidecar's `API_KEY` and use that same value here.\n\n- **Secret format:** the `API_KEY` value you set on the sidecar\n- **URL:** required — point at the **sidecar**, not Actual Budget itself, e.g. `http://actual-http-api:3000`"
  },
  {
    "id": "coinbase",
    "name": "Coinbase",
    "category": "Finance",
    "tags": [
      "finance",
      "crypto",
      "cloud"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Coinbase is a major cryptocurrency exchange and wallet. Its Developer Platform (CDP) API lets read-only apps like Stoa see your account balances and live spot prices to build a portfolio view.",
    "officialUrl": "https://www.coinbase.com",
    "polling": "5min",
    "secretFormat": "composite",
    "urlRequired": false,
    "gettingKey": "Coinbase issues **CDP (Coinbase Developer Platform) API keys** — JWT-signed keys, not the old HMAC style. You must create a new CDP key even if you have a legacy key.\n\n1. Go to **coinbase.com → Settings → API** (the **API** section — not **Advanced API**, which is for day-trading)\n2. Click **New API Key**\n3. Choose the **Ed25519** algorithm (the default, \"Highly recommended\")\n4. Set read-only scopes (sufficient for this panel)\n5. Coinbase downloads a JSON file immediately — **this is the only time you can access the private key, save it**\n\nThe JSON looks like:\n\n```json\n{\n  \"name\": \"organizations/abc123.../apiKeys/xyz789...\",\n  \"privateKey\": \"AAAAexamplebase64...==\"\n}\n```\n\nConcatenate the two fields with a colon, exactly as they appear (no quotes, no spaces):\n\n```\norganizations/abc123.../apiKeys/xyz789...:AAAAexamplebase64...==\n```\n\n- **Secret format:** `keyName:privateKey` (colon-separated, values from the JSON)\n- **URL:** none — the Coinbase API endpoint is fixed (`api.coinbase.com`)"
  },
  {
    "id": "crypto",
    "name": "Crypto",
    "category": "Finance",
    "tags": [
      "finance",
      "crypto",
      "built-in"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Crypto is a built-in Stoa feature — not a self-hosted app you deploy — that shows cryptocurrency prices with sparklines, sourced from CoinGecko. It works keyless (subject to rate limits) or with a free CoinGecko Demo key for reliability; you list coin IDs in the panel config.",
    "officialUrl": "https://www.coingecko.com",
    "polling": "5min",
    "secretFormat": "none",
    "urlRequired": false,
    "gettingKey": "Optional. The public CoinGecko API works without a key but has strict rate limits — get a free **Demo** key at coingecko.com for reliable use.\n\n- **Secret format:** blank, or an optional CoinGecko Demo API key\n- **URL:** none (standalone)"
  },
  {
    "id": "fireflyiii",
    "name": "Firefly III",
    "category": "Finance",
    "tags": [
      "finance",
      "budgeting",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Firefly III is a self-hosted personal finance manager. You record income and expenses across accounts, organize them with budgets, categories, and bills, and track net worth over time — a private, double-entry alternative to commercial budgeting apps.",
    "officialUrl": "https://www.firefly-iii.org",
    "polling": "60min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8080",
    "gettingKey": "Firefly III's Profile page offers **two different token types** on the same **OAuth** tab — Stoa needs the **Personal Access Token**, not an OAuth Client.\n\nFirefly III → **Profile** (top-right) → **OAuth** tab → scroll to the **Personal Access Tokens** section → **Create New Token** — give it a name, copy the generated token immediately (shown once).\n\n> **If you're asked for a Redirect URL, you're in the wrong section.** That's the \"OAuth Clients\" panel further up the same page — a separate authorization-code flow for apps that redirect a user's browser back after login. Stoa authenticates with a plain static token instead and has no redirect endpoint to receive that callback, so an OAuth Client won't work here. Personal Access Tokens ask for nothing but a name.\n\n- **Secret format:** Personal Access Token (PAT)\n- **URL:** required — point at your Firefly III port, e.g. `http://192.168.1.10:8080`"
  },
  {
    "id": "ghostfolio",
    "name": "Ghostfolio",
    "category": "Finance",
    "tags": [
      "finance",
      "investments",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Ghostfolio is a self-hosted, open-source wealth and investment tracker. It consolidates your stocks, ETFs, crypto, and cash across accounts into one dashboard, showing allocation, performance over time, and net worth — a privacy-friendly alternative to portfolio trackers that monetize your data.",
    "officialUrl": "https://ghostfol.io",
    "polling": "5min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:3333",
    "gettingKey": "Ghostfolio → **My Ghostfolio → User Account → Security Token** — this is the same recovery key Ghostfolio gave you on first login. Stoa exchanges it for a short-lived JWT on each refresh. For production, OIDC is recommended so the recovery key stays an emergency-only credential.\n\n- **Secret format:** security token (recovery key) — leave the username blank\n- **URL:** required — point at your Ghostfolio address, e.g. `http://192.168.1.10:3333`"
  },
  {
    "id": "stocks",
    "name": "Stocks",
    "category": "Finance",
    "tags": [
      "finance",
      "stocks",
      "crypto",
      "built-in"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Stocks is a built-in Stoa feature — not a self-hosted app you deploy — that shows US stock quotes with mini sparklines, sourced from the free public Yahoo Finance API. No account or key is needed; you just list ticker symbols in the panel config.",
    "officialUrl": "https://finance.yahoo.com",
    "polling": "5min",
    "secretFormat": "none",
    "urlRequired": false,
    "gettingKey": "None — Yahoo Finance is a public API, no credentials required.\n\n- **Secret format:** none\n- **URL:** none (standalone)"
  },
  {
    "id": "blueiris",
    "name": "Blue Iris",
    "category": "Digital Life",
    "tags": [
      "cameras",
      "nvr",
      "smart-home"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "Blue Iris is a Windows-based professional NVR / video-surveillance application. It records and manages many IP cameras with motion- and AI-triggered alerts, profiles, and remote access via web and mobile — a long-standing choice for Windows camera setups.",
    "officialUrl": "https://blueirissoftware.com",
    "polling": "30s",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:81",
    "gettingKey": "Create a Blue Iris user account with permission to access the JSON API (Blue Iris → **Users and Passwords**). Use it in `username:password` form.\n\n- **Secret format:** `username:password`\n- **URL:** required — point at the Blue Iris web server, e.g. `http://192.168.1.10:81`"
  },
  {
    "id": "caldav",
    "name": "CalDAV",
    "category": "Digital Life",
    "tags": [
      "calendar",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "CalDAV is an open standard (RFC 4791) for reading and writing calendars over HTTP, supported by Nextcloud, Fastmail, Radicale, Baïkal, Synology Calendar, Apple iCloud, and many others. In Stoa it isn't a panel of its own — you add a CalDAV calendar as a source in a Calendar panel. Because the protocol supports writing, those sources can also create events.",
    "officialUrl": "https://datatracker.ietf.org/doc/html/rfc4791",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "https://cloud.example.com/remote.php/dav/calendars/USERNAME/personal/",
    "gettingKey": "Create an **app password** on your calendar server where supported (Nextcloud: Settings → Security → Devices & sessions → \"Create new app password\"), then find your calendar collection URL.\n\n- **Secret format:** `username:password` — use an app password where the server supports them\n- **URL:** required — must be a specific **calendar collection**, not the server root. Example (Nextcloud): `https://cloud.example.com/remote.php/dav/calendars/USERNAME/personal/`\n\nWorks with any RFC 4791 CalDAV server: Nextcloud, Fastmail, Radicale, Baïkal, Synology Calendar, and others."
  },
  {
    "id": "docspell",
    "name": "Docspell",
    "category": "Digital Life",
    "tags": [
      "documents",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "Docspell is a self-hosted document organizer. It ingests your files (email, scans, uploads), OCRs and auto-tags them, links documents to people and organizations, and makes everything full-text searchable — an open-source document archive.",
    "officialUrl": "https://docspell.org",
    "polling": "15min",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:7880",
    "gettingKey": "Use your Docspell account credentials. Stoa exchanges them for a session token.\n\n- **Secret format:** `account:password` — `collective/user:password` for multi-collective setups, or `user:password` for a single collective\n- **URL:** required — point at your Docspell port, e.g. `http://192.168.1.10:7880`"
  },
  {
    "id": "duolingo",
    "name": "Duolingo",
    "category": "Digital Life",
    "tags": [
      "learning",
      "cloud"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Duolingo is the popular gamified language-learning app. It teaches languages through bite-sized lessons and tracks your daily streak, XP, crowns, and league. Stoa reads your **public profile** to display your streak and progress — no password or token needed.",
    "officialUrl": "https://www.duolingo.com",
    "polling": "5min",
    "secretFormat": "username",
    "urlRequired": false,
    "gettingKey": "Your Duolingo **username** is the only thing needed. It's in your profile URL (`https://www.duolingo.com/profile/USERNAME`) and under **Profile → Edit Profile** in the app. This integration uses Duolingo's public profile API — your profile must be publicly accessible (the default).\n\n- **Secret format:** your Duolingo username\n- **URL:** none — always uses `duolingo.com`"
  },
  {
    "id": "fittrackee",
    "name": "Fittrackee",
    "category": "Digital Life",
    "tags": [
      "fitness",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "FitTrackee is a self-hosted outdoor-activity tracker. Upload GPX files from your runs, rides, and hikes and it maps them and computes distance, duration, speed, and elevation stats — a private alternative to Strava for the workouts you own.",
    "officialUrl": "https://github.com/SamR1/FitTrackee",
    "polling": "15min",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:5000",
    "gettingKey": "Use your Fittrackee login in `email:password` form (e.g. `user@example.com:yourpassword`).\n\n- **Secret format:** `email:password`\n- **URL:** required — point at your Fittrackee port, e.g. `http://192.168.1.10:5000`"
  },
  {
    "id": "frigate",
    "name": "Frigate",
    "category": "Digital Life",
    "tags": [
      "cameras",
      "nvr",
      "smart-home",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "Frigate is an open-source network video recorder (NVR) with real-time, local AI object detection. It processes your IP camera feeds on your own hardware (optionally with a Coral TPU or GPU) to detect people, cars, and animals, recording and alerting without sending video to the cloud. It integrates tightly with Home Assistant.",
    "officialUrl": "https://frigate.video",
    "polling": "15s",
    "secretFormat": "none",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:5000",
    "gettingKey": "Most homelab Frigate instances run without auth (port 5000) — leave the secret blank. If you enabled built-in Frigate authentication, get a Bearer token from Frigate → Settings → Users.\n\n- **Secret format:** blank (unauthenticated) or Bearer token\n- **URL:** required — point at your Frigate port, e.g. `http://192.168.1.10:5000`"
  },
  {
    "id": "github",
    "name": "GitHub",
    "category": "Digital Life",
    "tags": [
      "developer",
      "cloud"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "GitHub is the world's largest platform for hosting and collaborating on code with Git. It provides repositories, pull requests, issues, Actions CI, and social features. Stoa reads your public profile, top repositories, and recent activity via the GitHub API.",
    "officialUrl": "https://github.com",
    "polling": "2min",
    "secretFormat": "api-key",
    "urlRequired": false,
    "gettingKey": "A Personal Access Token (classic or fine-grained). No URL is needed — Stoa always calls `api.github.com`.\n\n**Option A — Classic PAT (simpler)**\n\n1. GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)**\n2. Generate new token (classic); set an expiration and a note (e.g. \"Stoa dashboard\")\n3. Select scopes: `read:user` (profile, bio, follower counts) and `public_repo` (public repository list and metadata)\n4. Generate and copy the token (shown once)\n\n**Option B — Fine-grained PAT (more secure)**\n\n1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens**\n2. New fine-grained personal access token\n3. **Repository access:** \"Public Repositories (read-only)\"\n4. **Account permissions:** set **Profile** → Read-only\n5. Generate and copy the token (shown once)\n\n- **Secret format:** Personal Access Token\n- **URL:** none — always uses `api.github.com`"
  },
  {
    "id": "grocy",
    "name": "Grocy",
    "category": "Digital Life",
    "tags": [
      "groceries",
      "inventory",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Grocy is a self-hosted \"ERP for your groceries\" — a household-management app that tracks pantry stock and expiry dates, chores, tasks, and shopping lists, helping cut food waste and stay on top of the home.",
    "officialUrl": "https://grocy.info",
    "polling": "5min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:9283",
    "gettingKey": "Grocy → top-right menu → **Manage API Keys → + Add** → copy the key. (Grocy has no unauthenticated endpoints, so a key is required.)\n\n- **Secret format:** API key\n- **URL:** required — base URL of your Grocy instance, e.g. `http://192.168.1.10:9283`"
  },
  {
    "id": "homeassistant",
    "name": "Home Assistant",
    "category": "Digital Life",
    "tags": [
      "smart-home",
      "automation",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "Home Assistant is an open-source home-automation platform that connects and controls your smart-home devices locally. It integrates thousands of brands and protocols under one interface, exposes everything as entities you can automate, and keeps control on your own hardware rather than the cloud.",
    "officialUrl": "https://www.home-assistant.io",
    "polling": "60s",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8123",
    "gettingKey": "Home Assistant → **Profile** (bottom-left) → **Long-Lived Access Tokens → Create Token** (at the very bottom of the Profile page) — copy it.\n\n- **Secret format:** long-lived access token\n- **URL:** required — point at your Home Assistant port, e.g. `http://192.168.1.10:8123`"
  },
  {
    "id": "homebox",
    "name": "Homebox",
    "category": "Digital Life",
    "tags": [
      "inventory",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Homebox is a self-hosted home inventory manager. It catalogs your belongings by location and label, tracks purchase details, warranties, and values, and makes it easy to find what you own and where it is — handy for insurance and organization.",
    "officialUrl": "https://homebox.software",
    "polling": "15min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:7745",
    "gettingKey": "**Recommended:** create an API token — Homebox → Profile → API Tokens — and paste it as-is.\n\nAlternatively, use your Homebox login in `email:password` form (e.g. `user@example.com:yourpassword`); Stoa exchanges it for a session token on each connection.\n\n- **Secret format:** API token (recommended), or `email:password`\n- **URL:** required — point at your Homebox port, e.g. `http://192.168.1.10:7745`"
  },
  {
    "id": "life360",
    "name": "Life360",
    "category": "Digital Life",
    "tags": [
      "location",
      "cloud"
    ],
    "builtin": false,
    "status": "experimental",
    "whatIs": "Life360 is a family location-sharing app that shows where \"circle\" members are on a live map, with driving and check-in features. It has no official API — Stoa reads it through an unofficial, browser-extracted session token, which makes this integration **experimental** and prone to breaking without warning (see below). Life360 has no standalone panel; it's a GPS **source** for the Map panel.",
    "officialUrl": "https://www.life360.com",
    "polling": "2min",
    "secretFormat": "api-key",
    "urlRequired": false,
    "gettingKey": "1. Log into [life360.com](https://www.life360.com/login) in your browser\n2. Open DevTools (F12) → **Application** tab (Chrome/Edge) or **Storage** tab (Firefox) → **Cookies** → `https://www.life360.com`\n3. Find the cookie named `LIFE360_AUTH_TOKEN` and copy its value\n\nWhen it stops working (an auth error appears on the integration), repeat these steps with a fresh token.\n\n- **Secret format:** session bearer token (not an API key)\n- **URL:** none — Stoa always calls Life360's fixed API host"
  },
  {
    "id": "lubelogger",
    "name": "LubeLogger",
    "category": "Digital Life",
    "tags": [
      "vehicles",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "LubeLogger is a self-hosted vehicle-maintenance and fuel-mileage tracker. It records service history, odometer readings, and upcoming maintenance reminders per vehicle, helping you stay on top of oil changes, registrations, and repairs across your fleet.",
    "officialUrl": "https://lubelogger.com",
    "polling": "15min",
    "secretFormat": "username-password",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8080",
    "gettingKey": "If authentication is enabled in LubeLogger, use your login in `username:password` form. If auth is disabled (the default for self-hosted installs), leave the secret blank.\n\n- **Secret format:** `username:password`, or blank if auth is disabled\n- **URL:** required — point at your LubeLogger address, e.g. `http://192.168.1.10:8080`"
  },
  {
    "id": "mealie",
    "name": "Mealie",
    "category": "Digital Life",
    "tags": [
      "recipes",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Mealie is a self-hosted recipe manager and meal planner. It stores your recipes with photos and ingredients, imports them from URLs, builds weekly meal plans, and generates shopping lists — a private recipe box for your household.",
    "officialUrl": "https://mealie.io",
    "polling": "15min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:9000",
    "gettingKey": "Mealie → **User Settings → API Tokens → + Create** → choose **Long-lived** → copy the token. (Short-lived tokens expire and will stop the panel loading.)\n\n- **Secret format:** API token (Stoa adds `Bearer` automatically)\n- **URL:** required — base URL of your Mealie instance, e.g. `http://192.168.1.10:9000`"
  },
  {
    "id": "monica",
    "name": "Monica",
    "category": "Digital Life",
    "tags": [
      "contacts",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Monica is a self-hosted personal CRM (a \"personal relationship manager\"). It helps you remember details about the people in your life — conversations, important dates, gift ideas, and reminders — so you can stay in better touch, all kept private on your own server.",
    "officialUrl": "https://www.monicahq.com",
    "polling": "15min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8080",
    "gettingKey": "Monica → **Settings → API → Personal Access Tokens → Create** — copy the token.\n\n- **Secret format:** Bearer token\n- **URL:** required — point at your Monica port, e.g. `http://192.168.1.10:8080`"
  },
  {
    "id": "paperless",
    "name": "Paperless-ngx",
    "category": "Digital Life",
    "tags": [
      "documents",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "Paperless-ngx is a self-hosted document management system. It scans, OCRs, tags, and archives your paper documents into a searchable digital library, automatically pulling out dates, correspondents, and types — a private way to go paperless.",
    "officialUrl": "https://docs.paperless-ngx.com",
    "polling": "5min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8000",
    "gettingKey": "Paperless-ngx → **Settings → API → Generate Token** — copy it.\n\n- **Secret format:** API token\n- **URL:** required — point at your Paperless-ngx port, e.g. `http://192.168.1.10:8000`"
  },
  {
    "id": "strava",
    "name": "Strava",
    "category": "Digital Life",
    "tags": [
      "fitness",
      "cloud",
      "oauth"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "Strava is a popular social fitness platform for tracking running, cycling, and other activities. It records GPS activities, computes stats and segments, and adds a social feed. Stoa connects via OAuth to show your recent activities and rolling totals.",
    "officialUrl": "https://www.strava.com",
    "polling": "60s",
    "secretFormat": "oauth",
    "urlRequired": false,
    "gettingKey": "Create an app at [strava.com/settings/api](https://www.strava.com/settings/api) and copy the **Client ID** and **Client Secret**. After adding the integration you'll authorize your account via OAuth.\n\n- **Secret format:** `clientId:clientSecret`\n- **URL:** none — OAuth against Strava's cloud API"
  },
  {
    "id": "tandoor",
    "name": "Tandoor",
    "category": "Digital Life",
    "tags": [
      "recipes",
      "self-hosted"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Tandoor is a self-hosted recipe manager and meal planner. It organizes recipes with rich metadata and photos, imports them from the web, plans meals across the week, and builds shopping lists — a powerful open-source recipe database.",
    "officialUrl": "https://tandoor.dev",
    "polling": "15min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:8080",
    "gettingKey": "Tandoor → **Settings → API Tokens** → create a token with read access → copy it. (Tandoor's Copy button can silently fail; paste into a text editor first to verify.)\n\n- **Secret format:** API token (Stoa adds `Bearer` automatically)\n- **URL:** required — base URL of your Tandoor instance, e.g. `http://192.168.1.10:8080`"
  },
  {
    "id": "wger",
    "name": "wger",
    "category": "Digital Life",
    "tags": [
      "fitness",
      "self-hosted"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "wger is a self-hosted workout manager and fitness tracker. It lets you plan workout routines, log training sessions, track body weight and nutrition, and browse an exercise database — an open-source alternative to commercial fitness apps.",
    "officialUrl": "https://wger.de",
    "polling": "15min",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "http://192.168.1.10:80",
    "gettingKey": "wger → **Dashboard → API → Permanent API key** — copy it.\n\n- **Secret format:** plain API key\n- **URL:** required — point at your wger port, e.g. `http://192.168.1.10:80`"
  },
  {
    "id": "rss",
    "name": "RSS Feed",
    "category": "Online Content",
    "tags": [
      "news",
      "feeds"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "RSS (and Atom) are open web-feed formats that publish a site's latest content — articles, blog posts, podcasts, release notes — in a machine-readable stream. The RSS panel shows items from any feed URL you point it at; no account needed.",
    "polling": "5min",
    "secretFormat": "none",
    "urlRequired": false,
    "exampleUrl": "https://example.com/feed.xml",
    "gettingKey": "None for public feeds — leave the secret blank. For password-protected feeds, paste a Bearer token. The feed URL is configured **per panel**, not per integration, so one RSS integration can back many panels pointing at different feeds.\n\n- **Secret format:** none (public feeds) or a Bearer token (authenticated feeds)\n- **URL:** the feed URL, set in each panel's config, e.g. `https://example.com/feed.xml`"
  },
  {
    "id": "sports",
    "name": "Sports",
    "category": "Online Content",
    "tags": [
      "sports",
      "built-in"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Sports is a built-in Stoa feature — not a self-hosted app you deploy — showing scores, standings, and schedules for NHL, NFL, NBA, and MLB, sourced from ESPN's public API. No key is needed; you pick which leagues to show per panel.",
    "officialUrl": "https://www.espn.com",
    "polling": "5min",
    "secretFormat": "none",
    "urlRequired": false,
    "gettingKey": "None — ESPN's public API requires no credentials.\n\n- **Secret format:** none\n- **URL:** none (ESPN public API)"
  },
  {
    "id": "tmdb",
    "name": "TMDB",
    "category": "Online Content",
    "tags": [
      "movies",
      "tv",
      "discovery",
      "radarr",
      "sonarr"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "The Movie Database is a free, community-maintained movie/TV metadata source — the same one Radarr, Sonarr, Plex, Jellyfin, and (until recently) Trakt itself all source posters and metadata from. This integration surfaces TMDB's trending/popular/upcoming/top-rated lists directly in a Stoa panel, with one-click add to Radarr/Sonarr and a rating ceiling so it's safe to put on a panel shared with a household.",
    "officialUrl": "https://www.themoviedb.org",
    "polling": "1hr",
    "secretFormat": "api-key",
    "urlRequired": false,
    "exampleUrl": "\"\"",
    "gettingKey": "- **Secret format:** a TMDB v3 API key or v4 Read Access Token — both work, auto-detected. Get either at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) (free, no VIP or approval process).\n- **URL:** none needed — TMDB is a fixed cloud API."
  },
  {
    "id": "trakt",
    "name": "Trakt (legacy — not developed further)",
    "category": "Online Content",
    "tags": [
      "movies",
      "tv",
      "cloud",
      "deprecated"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Trakt is a service that automatically tracks the movies and TV shows you watch (scrobbling from Plex, Kodi, and others), with watchlists, ratings, and discovery lists. Stoa reads your public data to show watch history, stats, and Trending/Popular carousels — and can add titles straight to Radarr/Sonarr.",
    "officialUrl": "https://trakt.tv",
    "polling": "60s",
    "secretFormat": "composite",
    "urlRequired": false,
    "gettingKey": "Create an API app at [app.trakt.tv/settings/apps/api](https://app.trakt.tv/settings/apps/api) → click **+** → copy the **Client ID**. As of 2026 this requires a Trakt VIP subscription (see the notice above). Combine with your Trakt username (and optionally a TMDB key for artwork). Your Trakt profile must be **Public** (Account → Privacy).\n\n- **clientId** — from your Trakt API app\n- **username** — your Trakt username (at `trakt.tv/users/USERNAME`)\n- **tmdbApiKey** *(optional)* — TMDB v3 hex key or v4 Read Access Token for poster artwork (from `themoviedb.org/settings/api`)\n- **Secret format:** `clientId:username` or `clientId:username:tmdbApiKey`\n- **URL:** none — always uses `api.trakt.tv`. No OAuth flow needed (public data via Client ID + username)."
  },
  {
    "id": "twitch",
    "name": "Twitch",
    "category": "Online Content",
    "tags": [
      "video",
      "streaming",
      "cloud",
      "oauth"
    ],
    "builtin": false,
    "status": "needs-testing",
    "whatIs": "Twitch is the leading live-streaming platform for gaming and creators. Stoa connects via OAuth to show which of the channels you follow are currently live, with category, viewer count, and uptime.",
    "officialUrl": "https://www.twitch.tv",
    "polling": "60s",
    "secretFormat": "oauth",
    "urlRequired": false,
    "gettingKey": "Register an app in the [Twitch Developer Console](https://dev.twitch.tv/console) → **Register Your Application** → set the Redirect URI to `http://your-stoa:8080/api/twitch/callback` → copy the **Client ID** and **Client Secret**.\n\n- **Secret format:** `clientId:clientSecret`\n- **URL:** none — OAuth against the Twitch Helix API"
  },
  {
    "id": "weather",
    "name": "Weather",
    "category": "Online Content",
    "tags": [
      "weather",
      "built-in"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "Weather is a built-in Stoa feature — not a self-hosted app you deploy — showing current conditions and a multi-day forecast, sourced from the free public Open-Meteo API. No key is needed; you set a location per panel.",
    "officialUrl": "https://open-meteo.com",
    "polling": "10min",
    "secretFormat": "none",
    "urlRequired": false,
    "gettingKey": "None — Open-Meteo is a public API with no authentication required.\n\n- **Secret format:** none\n- **URL:** none (Open-Meteo public API)"
  },
  {
    "id": "youtube",
    "name": "YouTube",
    "category": "Online Content",
    "tags": [
      "video",
      "streaming",
      "cloud",
      "oauth"
    ],
    "builtin": false,
    "status": "tested",
    "whatIs": "YouTube is the world's largest video-sharing platform. Stoa connects via Google OAuth to read your subscription feed and show recent uploads from the channels you follow, playable inline in the panel.",
    "officialUrl": "https://www.youtube.com",
    "polling": "60min",
    "secretFormat": "oauth",
    "urlRequired": false,
    "gettingKey": "OAuth 2.0 credentials from the Google Cloud Console. No URL is needed — Stoa calls the YouTube Data API v3 directly.\n\n> **Already have a Google Calendar integration?** You can add YouTube to the same Google Cloud project — enable the YouTube Data API v3 on the existing project and add the YouTube redirect URI to the same OAuth client.\n\n1. [console.cloud.google.com](https://console.cloud.google.com) → **New Project** (or open your existing Stoa project)\n2. **APIs & Services → Library** → search **YouTube Data API v3** → **Enable**\n3. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID** → Application type **Web application** → under **Authorized redirect URIs** add `https://your-stoa-domain/api/youtube/callback` → **Create**, then copy the **Client ID** and **Client Secret**\n\n- **Secret format:** `clientId:clientSecret` (no spaces)\n- **URL:** none — always uses the YouTube Data API v3\n\n> **Redirect URI must be publicly routable.** Google does not allow `http://` for non-localhost redirect URIs. On first connect, Google may show an \"unverified app\" warning — this is expected for personal projects; choose **Advanced → Go to [app]** to proceed."
  },
  {
    "id": "bookmarks",
    "name": "Bookmarks",
    "category": "Stoa Features",
    "tags": [
      "bookmarks",
      "built-in"
    ],
    "builtin": true,
    "status": "tested",
    "whatIs": "Bookmarks is a built-in Stoa panel that displays a visual, foldered bookmark tree — a quick-launch board of links — with no external service; data is stored locally in Stoa. Both system (group-shared) and personal bookmarks are supported."
  },
  {
    "id": "calendar",
    "name": "Calendar",
    "category": "Stoa Features",
    "tags": [
      "calendar",
      "built-in"
    ],
    "builtin": true,
    "status": "tested",
    "whatIs": "The Calendar panel is a built-in Stoa panel that aggregates events from many sources — Google Calendar, CalDAV, ICS/Outlook feeds, the \\*arr apps, Home Assistant, finance apps, comics managers, and more — into one calendar. It needs no integration of its own; you add sources per panel, each with its own label, color, and days-ahead window. Google Calendar and CalDAV sources are writable."
  },
  {
    "id": "checklist",
    "name": "Checklist",
    "category": "Stoa Features",
    "tags": [
      "tasks",
      "built-in"
    ],
    "builtin": true,
    "status": "tested",
    "whatIs": "Checklist is a built-in Stoa panel for simple checkable lists, stored in Stoa with no external service. State can be personal or shared — on a shared panel, when one user checks an item it's checked for everyone who can see the panel. Items support optional due dates."
  },
  {
    "id": "customapi",
    "name": "Custom API",
    "category": "Stoa Features",
    "tags": [
      "custom",
      "built-in"
    ],
    "builtin": true,
    "status": "tested",
    "whatIs": "Custom API is a built-in Stoa panel that makes a GET request to any URL and displays the JSON response as formatted text — a catch-all for services Stoa doesn't natively support, simple status endpoints, or your own scripts that expose JSON. The endpoint URL is set in the panel config; an optional Bearer token can be stored as a secret.",
    "secretFormat": "api-key",
    "urlRequired": true,
    "exampleUrl": "https://example.com/status.json"
  },
  {
    "id": "docker-apps",
    "name": "Docker Apps",
    "category": "Stoa Features",
    "tags": [
      "docker",
      "built-in"
    ],
    "builtin": true,
    "status": "new",
    "whatIs": "The Docker Apps panel is a built-in Stoa panel that auto-discovers app-launcher tiles from labels on your running Docker containers, reusing [Homepage](https://gethomepage.dev)'s `homepage.*` label convention. No integration or per-app configuration is needed beyond the labels themselves."
  },
  {
    "id": "kanban",
    "name": "Kanban",
    "category": "Stoa Features",
    "tags": [
      "tasks",
      "built-in"
    ],
    "builtin": true,
    "status": "tested",
    "whatIs": "Kanban is a built-in Stoa panel for tracking tasks on boards — no external service or integration needed; data is stored locally in Stoa. Cards move across swim lanes (Not Started → In Progress → On Hold → Completed → Cancelled), with drag-and-drop on desktop and a lane picker on mobile."
  },
  {
    "id": "map",
    "name": "Map",
    "category": "Stoa Features",
    "tags": [
      "location",
      "built-in"
    ],
    "builtin": true,
    "status": "experimental",
    "whatIs": "The Map panel is a built-in Stoa panel that plots live GPS markers on a map, aggregating location sources (currently Life360) added per panel — the same pluggable-source pattern as the Calendar panel. It needs no integration of its own; you add sources on each panel."
  },
  {
    "id": "notes",
    "name": "Notes",
    "category": "Stoa Features",
    "tags": [
      "notes",
      "built-in"
    ],
    "builtin": true,
    "status": "tested",
    "whatIs": "Notes is a built-in Stoa panel — a shared, markdown-capable notepad stored in Stoa's own database, with no external service. It supports multi-user editing with locking (one editor at a time; others see read-only while locked) and works out of the box with no configuration. Both system (group-shared) and personal notes are supported."
  },
  {
    "id": "search",
    "name": "Search",
    "category": "Stoa Features",
    "tags": [
      "search",
      "built-in"
    ],
    "builtin": true,
    "status": "tested",
    "whatIs": "Search is a built-in Stoa panel that provides a search bar, passing your query to a configured search engine — any engine with a URL pattern, including self-hosted options like SearXNG. No external integration; configured directly in the panel."
  },
  {
    "id": "security-posture",
    "name": "Security Posture",
    "category": "Stoa Features",
    "tags": [
      "security",
      "cve",
      "built-in"
    ],
    "builtin": true,
    "status": "new",
    "whatIs": "The Security Posture panel is a built-in Stoa panel that, for a curated set of network- and storage-facing integrations, shows each one's detected running version alongside known CVEs for that product from the NVD. It auto-discovers your configured integrations — no source picker — and matches CVEs in one of two modes (CPE version-filtered, or keyword), described below."
  },
  {
    "id": "custom",
    "name": "Text / HTML",
    "category": "Stoa Features",
    "tags": [
      "custom",
      "built-in"
    ],
    "builtin": true,
    "status": "tested",
    "whatIs": "Text / HTML is a built-in Stoa panel that renders arbitrary HTML you write directly into the panel config — no integration or external service needed. Handy for freeform notes, full-panel images, or embedding MJPEG camera streams."
  },
  {
    "id": "iframe",
    "name": "Web Embed",
    "category": "Stoa Features",
    "tags": [
      "custom",
      "built-in"
    ],
    "builtin": true,
    "status": "tested",
    "whatIs": "Web Embed is a built-in Stoa panel that renders any URL inside an iframe filling the panel — useful for embedding web pages, dashboards, or other live content. No integration needed; the URL is set in the panel config."
  }
]
