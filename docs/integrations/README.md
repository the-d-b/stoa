# Integrations

All integrations Stoa supports. Each row links to a dedicated page with full setup instructions, panel description, and screenshots.

**Status legend:** ✅ Tested — verified working | 🔶 Need Testing — implemented, community validation welcome | 🧪 Experimental — new or complex, expect rough edges

---

## Media Servers

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| Plex | ✅ Tested | Plex token (`X-Plex-Token`) — get from your Plex account | Required | 60 s | [plex/](plex/) |
| Jellyfin | ✅ Tested | Plain API key — Jellyfin → Dashboard → API Keys | Required | 60 s | [jellyfin/](jellyfin/) |
| Emby | 🔶 Need Testing | Plain API key — Emby → Settings → API Keys | Required | 30 s | [emby/](emby/) |
| Tautulli | ✅ Tested | Plain API key — Tautulli → Settings → Web Interface → API Key | Required | 60 s | [tautulli/](tautulli/) |
| Jellystat | 🔶 Need Testing | Plain API key — Jellystat → Settings → API Key | Required | 60 s | [jellystat/](jellystat/) |
| Tracearr | 🔶 Need Testing | Plain API key — Tracearr → Settings → API | Required | 60 s | [tracearr/](tracearr/) |

---

## Media Management

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| Sonarr | ✅ Tested | Plain API key — Sonarr → Settings → General → API Key | Required | 30 min | [sonarr/](sonarr/) |
| Radarr | ✅ Tested | Plain API key — Radarr → Settings → General → API Key | Required | 30 min | [radarr/](radarr/) |
| Lidarr | ✅ Tested | Plain API key — Lidarr → Settings → General → API Key | Required | 30 min | [lidarr/](lidarr/) |
| Readarr | ✅ Tested | Plain API key — Readarr → Settings → General → API Key | Required | 30 min | [readarr/](readarr/) |
| Bazarr | 🔶 Need Testing | Plain API key — Bazarr → Settings → General → API Key | Required | 60 s | [bazarr/](bazarr/) |
| Prowlarr | 🔶 Need Testing | Plain API key — Prowlarr → Settings → General → API Key | Required | 60 s | [prowlarr/](prowlarr/) |
| autobrr | ✅ Tested | Plain API key — autobrr → Settings → API | Required | 30 s | [autobrr/](autobrr/) |
| Overseerr / Jellyseerr | 🔶 Need Testing | Plain API key — Overseerr → Settings → General → API Key | Required | 5 min | [overseerr/](overseerr/) |
| Tdarr | 🔶 Need Testing | Blank (no auth) **or** `apikey` **or** `username:password` (reverse-proxy) | Required | 30 s | [tdarr/](tdarr/) |
| Maintainerr | 🔶 Need Testing | Blank (no auth) **or** Bearer `token` | Required | 5 min | [maintainerr/](maintainerr/) |

---

## Photos & Libraries

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| Immich | 🔶 Need Testing | Plain API key — Immich → Account → API Keys | Required | 30 min | [immich/](immich/) |
| PhotoPrism | ✅ Tested | `username:password` — your PhotoPrism login | Required | 30 min | [photoprism/](photoprism/) |
| Lychee | 🔶 Need Testing | `username:password` — your Lychee login | Required | 30 min | [lychee/](lychee/) |
| Kavita | ✅ Tested | Plain API key — Kavita → User Settings → API Key | Required | 30 min | [kavita/](kavita/) |
| Komga | 🔶 Need Testing | `username:password` **or** plain API key | Required | 30 min | [komga/](komga/) |
| Audiobookshelf | ✅ Tested | `username:password` **or** plain API key (Settings → Users → API Token) | Required | 60 s | [audiobookshelf/](audiobookshelf/) |
| Navidrome | 🔶 Need Testing | `username:password` — your Navidrome login | Required | 30 s | [navidrome/](navidrome/) |

---

## Comics & Manga

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| Mylar3 | 🔶 Need Testing | Plain API key — Mylar3 → Settings → Web Interface → API Key | Required | 30 min | [mylar3/](mylar3/) |
| Kapowarr | 🔶 Need Testing | Plain API key — Kapowarr → Settings → API Key | Required | 30 min | [kapowarr/](kapowarr/) |
| Tranga | 🔶 Need Testing | Blank (no auth required by default) | Required | 30 min | [tranga/](tranga/) |

---

## Storage

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| TrueNAS | ✅ Tested | Plain API key — TrueNAS → Credentials → API Keys | Required | 30 s | [truenas/](truenas/) |
| Unraid | 🔶 Need Testing | `username:password` — your Unraid login | Required | 30 s | [unraid/](unraid/) |
| OpenMediaVault | 🔶 Need Testing | `username:password` — your OMV login | Required | 30 s | [omv/](omv/) |
| Synology DSM | 🔶 Need Testing | `username:password` — your Synology login | Required | 30 s | [synology/](synology/) |
| QNAP QTS | 🔶 Need Testing | `username:password` — your QNAP login | Required | 30 s | [qnap/](qnap/) |
| Proxmox | ✅ Tested | `user@realm!tokenid:secret` — Proxmox API token (full string) | Required | 30 s | [proxmox/](proxmox/) |
| Nextcloud | 🔶 Need Testing | `username:password` — use an app password from Settings → Security | Required | 5 min | [nextcloud/](nextcloud/) |
| Scrutiny | 🔶 Need Testing | Blank — no authentication required | Required | 5 min | [scrutiny/](scrutiny/) |

---

## Networking

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| OPNsense | ✅ Tested | `key:secret` — OPNsense → System → Access → API Keys | Required | 30 s | [opnsense/](opnsense/) |
| pfSense | 🔶 Need Testing | `username:password` — requires pfSense-pkg-API package | Required | 5 s | [pfsense/](pfsense/) |
| OpenWrt | 🔶 Need Testing | `username:password` — default username is `root` | Required | 5 s | [openwrt/](openwrt/) |
| Omada SDN | 🔶 Need Testing | `username:password` — Omada controller login (Open API v2, requires Omada 5.0+) | Required | 30 s | [omada/](omada/) |
| UniFi | 🔶 Need Testing | Plain API key (v9.3.43+) **or** `username:password` (legacy) | Required | 30 s | [unifi/](unifi/) |

---

## DNS & Proxy

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| Traefik | 🔶 Need Testing | Blank (open) **or** `username:password` (Basic Auth) **or** Bearer `token` | Required | 30 s | [traefik/](traefik/) |
| Nginx Proxy Manager | 🔶 Need Testing | `email:password` — your NPM login | Required | 60 s | [nginxpm/](nginxpm/) |
| Cloudflare | 🔶 Need Testing | Scoped API `token` **or** `email:globalApiKey` (legacy) | None (cloud) | 5 min | [cloudflare/](cloudflare/) |
| Pi-hole | 🔶 Need Testing | API `token` (v5) **or** web `password` (v6) | Required | 30 s | [pihole/](pihole/) |
| AdGuard Home | ✅ Tested | `username:password` — your AdGuard Home login | Required | 30 s | [adguard/](adguard/) |
| NextDNS | 🔶 Need Testing | Plain API key — NextDNS → Account → API Key | None (cloud) | 30 s | [nextdns/](nextdns/) |

---

## VPN & Security

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| Gluetun | ✅ Tested | Blank (no auth by default) | Required | 60 s | [gluetun/](gluetun/) |
| wg-easy | 🔶 Need Testing | Bare `password` — your wg-easy web UI password | Required | 30 s | [wgeasy/](wgeasy/) |
| Tailscale | 🔶 Need Testing | API token — `tskey-api-...` from Tailscale admin console | None (cloud) | 60 s | [tailscale/](tailscale/) |
| Netbird | 🔶 Need Testing | Personal Access Token — Netbird → Settings → PATs | URL or cloud | 60 s | [netbird/](netbird/) |
| Authentik | ✅ Tested | Plain API token — Authentik → Admin → System → API Tokens | Required | 5 min | [authentik/](authentik/) |

---

## Monitoring

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| Uptime Kuma | ✅ Tested | Blank (no auth) **or** plain API key (Kuma 1.23+) | Required | 60 s | [kuma/](kuma/) |
| Prometheus | 🔶 Need Testing | Blank (open) **or** `username:password` **or** Bearer `token` | Required | 30 s | [prometheus/](prometheus/) |
| Grafana | 🔶 Need Testing | Service Account token — Grafana → Administration → Service Accounts | Required | 60 s | [grafana/](grafana/) |

---

## Downloads

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| Transmission | ✅ Tested | `username:password` **or** blank (if auth disabled) | Required | 30 s | [transmission/](transmission/) |
| qBittorrent | 🔶 Need Testing | `username:password` | Required | 30 s | [qbittorrent/](qbittorrent/) |
| Deluge | 🔶 Need Testing | Bare `password` — Deluge Web UI password (no username) | Required | 30 s | [deluge/](deluge/) |
| ruTorrent | 🔶 Need Testing | `username:password` **or** blank (if auth disabled) | Required | 30 s | [rutorrent/](rutorrent/) |
| SABnzbd | 🔶 Need Testing | Plain API key — SABnzbd → Config → General → API Key | Required | 15 s | [sabnzbd/](sabnzbd/) |
| NZBGet | 🔶 Need Testing | `username:password` — NZBGet control user credentials | Required | 15 s | [nzbget/](nzbget/) |

---

## Smart Home

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| Home Assistant | 🔶 Need Testing | Long-lived access token — HA → Profile → Long-Lived Access Tokens | Required | 60 s | [homeassistant/](homeassistant/) |
| Frigate | 🔶 Need Testing | Blank (unauthenticated) **or** Bearer `token` from Frigate → Settings → Users | Required | 15 s | [frigate/](frigate/) |
| Blue Iris | 🔶 Need Testing | `username:password` — Blue Iris user account | Required | 30 s | [blueiris/](blueiris/) |
| LubeLogger | 🔶 Need Testing | `username:password` **or** Bearer `token` | Required | 15 min | [lubelogger/](lubelogger/) |

---

## Development

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| GitHub | 🔶 Need Testing | Classic or fine-grained PAT — GitHub → Settings → Developer Settings; scopes: `read:user`, `public_repo` | None (GitHub API) | 2 min | [github/](github/) |

---

## Gaming

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| Steam | ✅ Tested | Steam Web API key — `steamcommunity.com/dev/apikey` | None (Steam API) | 5 min | [steam/](steam/) |
| RomM | 🔶 Need Testing | `username:password` **or** Bearer `token` | Required | 15 min | [romm/](romm/) |
| Pterodactyl | 🔶 Need Testing | Client API key — Pterodactyl → Account → API Credentials | Required | 60 s | [pterodactyl/](pterodactyl/) |

---

## Finance

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| Firefly III | 🔶 Need Testing | Personal Access Token — Firefly III → Profile → OAuth → PATs | Required | 60 min | [fireflyiii/](fireflyiii/) |
| Actual Budget | ✅ Tested | API key — set as `API_KEY` env var on the `actual-http-api` sidecar | Required | 5 min | [actualbudget/](actualbudget/) |
| Ghostfolio | 🔶 Need Testing | Security token — Ghostfolio → User Account → Security Token | Required | 5 min | [ghostfolio/](ghostfolio/) |
| Coinbase | 🔶 Need Testing | `apiKey:apiSecret` — Coinbase → Settings → API (read-only key) | None (cloud) | 5 min | [coinbase/](coinbase/) |
| Stocks | ✅ Tested | Blank — Yahoo Finance public data, no key needed | None (standalone) | 5 min | [stocks/](stocks/) |
| Crypto | ✅ Tested | Blank **or** CoinGecko Demo API key (optional, for higher limits) | None (standalone) | 5 min | [crypto/](crypto/) |

---

## Documents

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| Paperless-ngx | 🔶 Need Testing | API `token` — Paperless → Settings → API → Generate Token | Required | 5 min | [paperless/](paperless/) |
| Docspell | 🔶 Need Testing | `account:password` where account is `collective/user` | Required | 15 min | [docspell/](docspell/) |

---

## Personal

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| Monica | 🔶 Need Testing | Bearer `token` — Monica → Settings → API → Personal Access Tokens | Required | 15 min | [monica/](monica/) |
| Homebox | 🔶 Need Testing | `email:password` — your Homebox login | Required | 15 min | [homebox/](homebox/) |

---

## Health & Fitness

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| wger | 🔶 Need Testing | Plain API key — wger Dashboard → API (permanent token) | Required | 15 min | [wger/](wger/) |
| Fittrackee | 🔶 Need Testing | `email:password` — your Fittrackee login | Required | 15 min | [fittrackee/](fittrackee/) |
| Strava | 🔶 Need Testing | `clientId:clientSecret` — Strava API settings; connect account after saving | None (OAuth) | 60 s | [strava/](strava/) |
| Duolingo | 🔶 Need Testing | `username:password` — your Duolingo login | None (unofficial API) | 60 s | [duolingo/](duolingo/) |

---

## Music

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| Spotify | 🔶 Need Testing | `clientId:clientSecret` — Spotify Developer Dashboard; connect account after saving | None (OAuth) | 30 s | [spotify/](spotify/) |
| Last.fm | 🔶 Need Testing | `username:apiKey` — username + API key from last.fm/api | None (Last.fm API) | 30 s | [lastfm/](lastfm/) |

---

## Food & Home

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| Mealie | 🔶 Need Testing | Bearer `token` — Mealie → User Settings → API Tokens | Required | 15 min | [mealie/](mealie/) |
| Grocy | 🔶 Need Testing | Plain API key — Grocy → Manage API Keys | Required | 5 min | [grocy/](grocy/) |
| Tandoor | 🔶 Need Testing | Bearer `token` — Tandoor → Settings → API Tokens | Required | 15 min | [tandoor/](tandoor/) |

---

## Content

| Integration | Status | Secret | URL | Polling | Page |
|---|---|---|---|---|---|
| YouTube | 🧪 Experimental | `clientId:clientSecret` — Google Cloud Console; connect account after saving | None (OAuth) | 60 min | [youtube/](youtube/) |
| Twitch | 🔶 Need Testing | `clientId:clientSecret` — Twitch Developer Console; connect account after saving | None (OAuth) | 60 s | [twitch/](twitch/) |
| Trakt | 🔶 Need Testing | `clientId:username` — Client ID from trakt.tv/oauth/applications + your Trakt username | None (Trakt API) | 60 s | [trakt/](trakt/) |
| RSS / Atom | ✅ Tested | Blank (public feeds) **or** Bearer `token` (authenticated feeds) | Feed URL | 5 min | [rss/](rss/) |
| Weather | ✅ Tested | Blank — Open-Meteo public API, no key needed | None (standalone) | 10 min | [weather/](weather/) |
| Sports | ✅ Tested | Blank — ESPN public API, no key needed | None (standalone) | 5 min | [sports/](sports/) |

---

## Productivity (standalone panels — no integration required)

| Panel | Status | Notes | Page |
|---|---|---|---|
| Calendar | ✅ Tested | Aggregates from Sonarr / Radarr / Lidarr / Readarr / Google Calendar sources | [calendar/](calendar/) |
| Kanban | ✅ Tested | Local task boards — data stored in Stoa's database | [kanban/](kanban/) |
| Notes | ✅ Tested | Shared markdown-capable notes with multi-user locking | [notes/](notes/) |
| Checklist | ✅ Tested | Shared checklists with real-time state sync | [checklist/](checklist/) |
| Bookmarks | ✅ Tested | Nested bookmark tree with custom icons | [bookmarks/](bookmarks/) |
| Search | ✅ Tested | Search bar forwarding to any search engine | [search/](search/) |
| Custom API | ✅ Tested | Generic JSON GET endpoint panel | [customapi/](customapi/) |
| Text / HTML | ✅ Tested | Freeform HTML content — no external service needed | [custom/](custom/) |
| Web Embed | ✅ Tested | Renders any URL in an iframe | [iframe/](iframe/) |

---

## How credentials work

Stoa stores credentials in **secrets** — encrypted at rest using AES-256-GCM, derived from your `STOA_SESSION_SECRET`. Credentials are never returned in full after saving and are never sent to the browser.

All credentials use a single "API key / secret" field. The format varies by service:

| Format | Example | Used by |
|---|---|---|
| Plain API key | `abc123...` | Sonarr, Radarr, Lidarr, TrueNAS, Jellyfin, Kuma, Immich, Kavita, SABnzbd, Prowlarr, Bazarr, autobrr, NextDNS, Paperless-ngx, Grocy |
| `username:password` | `admin:mysecret` | Synology, QNAP, OMV, Unraid, Transmission, qBittorrent, ruTorrent, NZBGet, PhotoPrism, Navidrome, Lychee, OpenWrt, Omada, AdGuard, Blue Iris, Nextcloud, Duolingo, Homebox, Fittrackee |
| Bare password (no username) | `mysecret` | Deluge, wg-easy |
| `email:password` | `me@example.com:pass` | Nginx Proxy Manager, Fittrackee, Homebox |
| `username:apiKey` | `alice:abc123` | Last.fm |
| `clientId:clientSecret` → OAuth | `abc:xyz` | Spotify, Strava, Twitch, YouTube |
| `clientId:username` | `abc123:alice` | Trakt |
| `key:secret` | `key:secret` | OPNsense, Coinbase (`apiKey:apiSecret`) |
| `user@realm!tokenid:secret` | `root@pam!stoa:abc` | Proxmox API token |
| `account:password` | `collective/user:pass` | Docspell |
| Long-lived / PAT token | `hass_token...` | Home Assistant, GitHub, Netbird, Monica, Pterodactyl, Firefly III |
| Service Account token | `glsa_...` | Grafana |
| Scoped API token | `cloudflare_token` | Cloudflare (recommended over Global API Key) |
| Security token | `abc123` | Ghostfolio (exchanged for a short-lived JWT) |
| Blank (no auth) | — | Scrutiny, Gluetun (optional), Frigate (optional), Weather, Sports, Stocks |

The colon convention (`username:password`) follows the same format as `curl -u user:pass` — Stoa splits on the **first** colon only, so passwords containing colons are supported.
