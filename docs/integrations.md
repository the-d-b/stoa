# Integrations

Integrations connect Stoa to your services. Each panel needs an integration to pull its data from.

---

## How credentials work

Stoa stores credentials in **secrets** — encrypted at rest, never exposed in full after saving. When you create an integration you select a secret to authenticate with.

Different services use different authentication schemes. Stoa normalises these behind a single "API key" field in the secret, but the format of what you store varies:

| Format | Used by | Why |
|---|---|---|
| Plain API key | Sonarr, Radarr, Lidarr, TrueNAS, Unraid, Authentik, Kuma, Emby, Jellystat, Immich, Kavita, Tracearr, UniFi (v9.3.43+) | These services issue a single opaque token |
| `username:password` | OMV, Synology, QNAP, Transmission, qBittorrent, ruTorrent, PhotoPrism, Gluetun, Lychee, Navidrome, OpenWrt, Omada, UniFi (legacy) | Stoa logs in with these credentials and uses a session token (or passes them as Basic Auth). The colon separates the username from the password — Stoa splits on the first colon. |
| `username:password` or bare API key | Komga, Audiobookshelf | If the value contains a colon, Stoa uses Basic Auth (Komga) or logs in as a user (Audiobookshelf). If there is no colon, the value is treated as a direct API key. |
| Password only | Deluge | Deluge Web UI authenticates with just a password (no username). |
| `key:secret` | OPNsense | OPNsense issues a two-part API credential (key + secret). Stoa joins them with a colon and authenticates via HTTP Digest. |
| `user@realm!tokenid:secret` | Proxmox | Proxmox API token format — the full token string goes in the Authorization header |
| Token (query param) | Plex | Plex appends `X-Plex-Token` to every request URL |
| API key (query param) | Tautulli | Tautulli appends `apikey` to every request URL |

**Why a single field for two values?** Several services require both a username and a password (or key and secret). Rather than two separate secret fields, Stoa uses the convention `username:password` stored as one value. The colon is the separator — Stoa splits on the first colon. This is the same format curl uses with `-u user:pass`.

---

## Readarr

**What it shows:** Upcoming book and audiobook releases, recently added titles, missing books, book and author counts.

**Auth:** Plain API key. Find it in Readarr → Settings → General → API Key.

**URL:** Your Readarr base URL, e.g. `http://192.168.1.10:8787`

**Calendar:** Readarr releases appear on the calendar panel. Configure days-ahead per source (7–90 days) in Profile → Integrations → Calendar Sources.

---

## Sonarr

**What it shows:** Upcoming episode schedule, recently downloaded episodes, wanted/missing episodes, series count, episode count.

**Calendar:** Sonarr episode air dates appear on the calendar panel. Configure days-ahead per source (7–90 days) in Profile → Integrations → Calendar Sources.

**Auth:** Plain API key. Find it in Sonarr → Settings → General → API Key.

**URL:** Your Sonarr base URL, e.g. `http://192.168.1.10:8989`

**TLS:** Enable "Skip TLS verify" if using a self-signed certificate.

---

## Radarr

**What it shows:** Upcoming movie releases, recently downloaded movies, wanted/missing movies, movie count.

**Auth:** Plain API key. Find it in Radarr → Settings → General → API Key.

**URL:** Your Radarr base URL, e.g. `http://192.168.1.10:7878`

**Calendar:** Radarr release dates appear on the calendar panel. Configure days-ahead per source (7–90 days) in Profile → Integrations → Calendar Sources.

---

## Lidarr

**What it shows:** Upcoming album releases, recently downloaded albums, wanted/missing albums, artist and track counts.

**Auth:** Plain API key. Find it in Lidarr → Settings → General → API Key.

**URL:** Your Lidarr base URL, e.g. `http://192.168.1.10:8686`

**Calendar:** Lidarr release dates appear on the calendar panel. Configure days-ahead per source (7–90 days) in Profile → Integrations → Calendar Sources.

---

## Plex

**What it shows:** Active streams with user, media title, and progress. Library counts (movies, shows, music). Update availability.

**Auth:** Plex token. To find yours: sign into Plex Web, open any media item, click the three-dot menu → Get Info → View XML. The token is the `X-Plex-Token` value in the URL.

**URL:** Your Plex server URL, e.g. `http://192.168.1.10:32400`

---

## Tautulli

**What it shows:** Current streams, most played content, recently played history, user statistics.

**Auth:** Plain API key. Find it in Tautulli → Settings → Web Interface → API Key.

**URL:** Your Tautulli base URL, e.g. `http://192.168.1.10:8181`

---

## TrueNAS

**What it shows:** CPU usage and temperature, RAM usage, ZFS ARC size, disk I/O, network throughput, pool health and capacity, disk temperatures, alerts, VMs, apps.

**Real-time:** TrueNAS uses a persistent WebSocket connection (DDP protocol). Data updates every ~2 seconds without polling.

**Auth:** Plain API key. In TrueNAS SCALE: Credentials → API Keys → Add. In TrueNAS CORE: Account → Users → your user → API Keys.

**URL:** Your TrueNAS base URL, e.g. `https://truenas.local`

**TLS:** TrueNAS uses TLS renegotiation — Stoa handles this automatically. Enable "Skip TLS verify" for self-signed certificates.

---

## Unraid

**What it shows:** CPU usage (per-core and aggregate), memory usage, network throughput, array status, disk temperatures, running VMs and containers, Docker containers.

**Real-time:** Unraid uses a persistent WebSocket connection (`graphql-transport-ws` subprotocol) to `/graphql`. Live subscriptions stream CPU, memory, and network data without polling. Stoa falls back to HTTP polling if the WebSocket connection is unavailable.

**Auth:** Plain API key. In Unraid: Settings → Management Access → API → Create API Key.

**URL:** Your Unraid base URL, e.g. `http://tower` or `http://192.168.1.10`

**Port:** Unraid's built-in web interface runs on port 80 (HTTP) by default. If you've configured a different port or HTTPS, use the full URL.

---

## OpenMediaVault (OMV)

**What it shows:** CPU usage, memory usage, network throughput (per interface), filesystem usage, disk temperatures and SMART status, and system uptime.

**Auth:** OMV username and password in `username:password` format. Stoa logs in via the OMV RPC API and holds a session token (`X-OPENMEDIAVAULT-SESSIONID` header) for subsequent requests. The session is automatically refreshed if it expires.

**URL:** Your OMV base URL, e.g. `http://192.168.1.10`

**Port:** OMV's web interface runs on port 80 (HTTP) by default.

**TLS:** Enable "Skip TLS verify" if using a self-signed certificate.

---

## Synology DSM

**What it shows:** CPU usage, memory usage, network throughput (per interface), volume health and capacity, disk temperatures and SMART status, shared folder list, hostname, model, DSM version, and uptime.

**Auth:** Synology username and password in `username:password` format. Stoa authenticates via POST to `/webapi/auth.cgi` and receives a session ID (`_sid`), which is passed as a query parameter on all subsequent API calls. The session is automatically refreshed on expiry (DSM error code 119).

**URL:** Your Synology base URL, e.g. `http://192.168.1.10:5000`

**Ports:** DSM defaults to port 5000 (HTTP) and 5001 (HTTPS).

**TLS:** Enable "Skip TLS verify" for self-signed certificates (common when using DSM's built-in certificate).

**2FA:** Two-factor authentication is not supported — use an account without 2FA enabled, or create a dedicated Stoa account with 2FA disabled.

**Network rates:** Synology's utilization API returns current transfer rates in KB/s directly (not cumulative counters), so no delta calculation is needed.

---

## QNAP QTS

**What it shows:** CPU usage, memory usage, aggregate network throughput, volume health and capacity, disk temperatures and SMART status, shared folder list, hostname, model, firmware version, and uptime.

**Auth:** QNAP username and password in `username:password` format. Stoa MD5-hashes the password (matching the QTS web UI's own login flow) and authenticates via `/cgi-bin/authLogin.cgi`, receiving a session ID (`authSid`) in an XML response. The session ID is appended to all subsequent CGI requests. Session expiry is detected either by HTTP 401 or by `authPassed=0` in the XML response body.

**URL:** Your QNAP base URL, e.g. `http://192.168.1.10:8080`

**Port:** QNAP QTS defaults to port 8080 (HTTP) and 443 (HTTPS). Older firmwares may use port 80.

**TLS:** Enable "Skip TLS verify" for self-signed certificates.

**2FA:** Two-factor authentication is not supported — use an account without 2FA, or create a dedicated Stoa user with 2FA disabled.

**Firmware compatibility:** Stoa supports both QTS 4.x and QTS 5.x. The two versions use different XML schemas for system info; Stoa detects which is in use at runtime and parses accordingly.

---

## Proxmox

**What it shows:** Node status, CPU and memory usage, load average, storage usage, running VMs and containers, cluster overview.

**Auth:** Proxmox API token in the format `user@realm!tokenid:secret`. Create one in Datacenter → Permissions → API Tokens. The full token string (including the `!tokenid` part) goes before the colon; the token secret goes after.

Example secret value: `root@pam!stoa:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

**URL:** Your Proxmox base URL, e.g. `https://proxmox.local:8006`

**TLS:** Enable "Skip TLS verify" for self-signed certificates (common with Proxmox).

---

## OPNsense

**What it shows:** Interface traffic rates (live via SSE stream), firewall event donut with per-rule breakdown, top WAN talkers, DNS cache stats, PF states, firmware version and update status.

**Real-time:** OPNsense exposes SSE streams (`/api/diagnostics/traffic/stream/1` and `/api/diagnostics/firewall/stream_log`). Stoa connects to these directly — traffic data updates every second, firewall events are live.

**Auth:** OPNsense API key and secret in `key:secret` format. Create credentials in System → Access → Users → your user → API Keys. The key and secret are shown once on creation.

Example secret value: `w86XNZob/8Oq8aC5r0kbNarNtd...:XeD26XVrJ5ilAc/EmglCRC+0j2...`

**URL:** Your OPNsense base URL, e.g. `https://opnsense.local`

---

## pfSense

**What it shows:** CPU and memory usage, uptime, version, interface traffic rates (with Mbps deltas), gateway status with RTT and packet loss, firewall connection states (current and limit).

**Polling:** No SSE or WebSocket — Stoa polls the pfSense REST API every 5 seconds.

**Requirements:** The [pfSense-pkg-API](https://github.com/jaredhendrickson13/pfsense-api) community package must be installed (System → Package Manager → Available Packages → search "pfsense-api").

**Auth:** Two options:
- Bare API key (no colon) — generate one in pfSense-pkg-API Settings. Stoa sends it as `Authorization: {key}`.
- `username:password` — Stoa sends Basic Auth.

**URL:** Your pfSense base URL, e.g. `https://pfsense.local`

**TLS:** Enable "Skip TLS verify" for self-signed certificates (common with pfSense).

---

## OpenWrt

**What it shows:** Hostname, uptime, 1-minute load average, memory usage, interface traffic rates (Mbps deltas), and WiFi client list with signal strength and TX/RX rates per client. The WiFi client data is a differentiator — it uses `iwinfo.assoclist` to show which clients are connected and their signal quality.

**Polling:** No SSE or WebSocket — Stoa polls via OpenWrt's ubus JSON-RPC interface every 5 seconds.

**Auth:** `username:password` format. The default OpenWrt username is `root`. If you use a bare password with no colon, Stoa uses `root` as the username.

Example: `root:mypassword`

**URL:** Your OpenWrt LuCI base URL, e.g. `http://192.168.1.1`

**WiFi clients:** Requires `iwinfo` to be installed. On some OpenWrt builds it's not included. The panel degrades gracefully — if `iwinfo` is unavailable, everything except the client list still works.

---

## Omada SDN

**What it shows:** Device status across your Omada network (gateways, APs, switches — online/offline counts by type), total client counts (wireless vs. wired), per-site breakdown for multi-site deployments, a scrollable device list with model and client count, recent wireless and wired clients, and active alerts.

**Polling:** REST-only — Stoa polls the Omada Open API every 30 seconds.

**Requirements:** Omada SDN Controller 5.0+ (hardware: OC200/OC300, or software controller). Uses the Open API v2.

**Auth:** `username:password` in the API key field. This must be an Omada controller account with permission to access the Open API. Create or use an existing admin account.

**URL:** Your Omada controller base URL, e.g. `https://omada.local:8043`

**TLS:** Enable "Skip TLS verify" for self-signed certificates (common with Omada controllers using self-signed TLS).

**Multi-site:** If your controller manages multiple sites, Stoa fetches data for all sites and shows per-site device and client counts in addition to the aggregate.

---

## Traefik

**What it shows:** All configured HTTP and TCP routes with their rules, entry points, TLS status, provider, and enabled/warning/disabled state. Backend service health — for any service with health checks enabled, shows each server URL as UP or DOWN. Provider summary (Docker, Kubernetes, file). Traefik version. Features active (metrics, tracing, access log).

**API:** Traefik's built-in REST API (`/api`). Must be enabled explicitly — add `--api=true` (or `api: {}` in static config). The API is read-only.

**Security:** The API should not be exposed publicly without authentication. Common setups use a Traefik BasicAuth middleware on the dashboard router. Stoa supports:
- No secret: open API (insecure mode or no auth required)
- `username:password` in the API key field → HTTP Basic Auth
- Bare token → `Authorization: Bearer` header

**URL:** Your Traefik API base URL, e.g. `http://192.168.1.10:8080` (the API port, not a proxied route).

**Internal routes:** Routes created by Traefik itself (`api@internal`, `dashboard@internal`, `ping@internal`) are excluded from the route list but counted in the totals.

**Backend health:** Service server status (UP/DOWN) only appears when health checks are configured for that service. Services without health checks are listed with no health indicator.

**TLS:** Enable "Skip TLS verify" if your Traefik API is behind HTTPS with a self-signed certificate.

---

## UniFi

**What it shows:** Device inventory (APs, switches, gateways) with online/offline status and per-device detail — AP radio stats (band, channel, channel utilization %, client count), switch port summary (ports up, PoE power delivered), gateway WAN status (IP, latency, speedtest results). Connected client list with IP, band (2.4G/5G/6G), RSSI, and satisfaction score (0–100). Real-time event log (client connects/disconnects, device state changes).

**Real-time:** Stoa connects to the UniFi WebSocket event stream for near-instant event updates. Full device and client stats refresh every 30 seconds via REST.

**Auth (API key, recommended):** Generate an API key in UniFi OS → Settings → API → Create New API Key. Paste the bare key (no colon) into the API key field. Requires UniFi Network Application v9.3.43 or later.

**Auth (username:password):** Store `username:password` in the API key field. Stoa auto-detects UniFi OS (port 443, `/api/auth/login`) and falls back to legacy controller (port 8443, `/api/login`).

**URL:** Your controller base URL, e.g. `https://192.168.1.1` for UniFi OS, or `https://192.168.1.1:8443` for the legacy Network Application.

**Site:** Stoa connects to the `default` site. Single-site setups work automatically. If you need a different site key, it must be `default` for now (multi-site support is planned).

**TLS:** Enable "Skip TLS verify" for self-signed certificates (common with UniFi OS's built-in certificate).

---

## Uptime Kuma

**What it shows:** Monitor status (up/down/pending), response times, uptime percentages, incident history.

**Auth:** API key (Bearer token). In Kuma: Settings → API Keys → Add API Key.

**URL:** Your Kuma base URL, e.g. `http://192.168.1.10:3001`

---

## Gluetun

**What it shows:** VPN connection status, current IP address and location, WireGuard/OpenVPN mode.

**Auth:** API key. Set `HTTP_CONTROL_SERVER_AUTH_USERNAME` and `HTTP_CONTROL_SERVER_AUTH_PASSWORD` in your Gluetun config. Store as `username:password` in the secret. If you haven't set auth, leave the secret empty.

**URL:** Your Gluetun HTTP control server URL, e.g. `http://192.168.1.10:8000`

---

## Transmission

**What it shows:** Active downloads with progress and speed, seeding count, total upload/download stats.

**Auth:** Transmission RPC username and password in `username:password` format. Set in Transmission preferences → Remote. If authentication is disabled, use any value for both.

**URL:** Your Transmission RPC URL, e.g. `http://192.168.1.10:9091`

---

## qBittorrent

**What it shows:** Active downloads with progress and speed, seeding count, free disk space, tracker breakdown.

**Auth:** qBittorrent Web UI username and password in `username:password` format. Configured in qBittorrent → Options → Web UI.

**URL:** Your qBittorrent Web UI base URL, e.g. `http://192.168.1.10:8080`

---

## Deluge

**What it shows:** Active downloads with progress and speed, seeding count, free disk space, tracker breakdown.

**Auth:** Deluge Web UI password **only** (no username) — just the password string in the secret field. Set in Deluge Web UI → Preferences → Interface.

**URL:** Your Deluge Web UI base URL, e.g. `http://192.168.1.10:8112`

---

## ruTorrent

**What it shows:** Active downloads with progress and speed, seeding count, free disk space, tracker breakdown (if the httprpc plugin is installed).

**Auth:** ruTorrent username and password in `username:password` format. These are the HTTP Basic Auth credentials configured in your web server (nginx/Apache) in front of ruTorrent.

**URL:** Your ruTorrent base URL, e.g. `http://192.168.1.10/rutorrent`. Stoa appends `/plugins/httprpc/action.php` — the httprpc plugin must be installed in ruTorrent.

---

## PhotoPrism

**What it shows:** Photo and video counts, library size, recent imports, indexing status. Photo preview carousel with random thumbnails (refreshed daily; use "Refresh now" in the panel context menu to pick a new set).

**Auth:** PhotoPrism username and password in `username:password` format. Stoa logs in via the PhotoPrism API and uses the session token for subsequent requests.

**URL:** Your PhotoPrism base URL, e.g. `http://192.168.1.10:2342`

---

## Immich

**What it shows:** Photo and video counts, storage usage, user count, server version, and a photo preview carousel with random thumbnails (refreshed daily; use "Refresh now" in the panel context menu to pick a new set).

**Auth:** API key. In Immich: Account Settings → API Keys → New API Key. An admin key shows server-wide statistics; a user key shows only that user's library.

**URL:** Your Immich base URL, e.g. `http://192.168.1.10:2283`

---

## Lychee

**What it shows:** Photo count, album count, total storage, user count, and a photo preview carousel (random thumbnails, refreshed daily).

**Auth:** Lychee username and password in `username:password` format. Stoa logs in via the Lychee API and holds a session cookie for subsequent requests.

**URL:** Your Lychee base URL, e.g. `http://192.168.1.10`

**TLS:** Enable "Skip TLS verify" for self-signed certificates.

---

## Kavita

**What it shows:** Series count, total file count, library list, and a recently-added series strip with cover thumbnails.

**Auth:** API key. In Kavita: User Settings (top right avatar) → API Key. Copy the key and store it as a secret.

**URL:** Your Kavita base URL, e.g. `http://192.168.1.10:5000`

---

## Komga

**What it shows:** Series count, book count, library list, and a recently-added series strip with cover thumbnails.

**Auth:** Two options — use whichever matches your Komga setup:
- `username:password` — standard Komga credentials (Basic Auth)
- Bare API key — if you have an API key configured in Komga

Store the value as a secret. If it contains a colon, Stoa uses Basic Auth. If it has no colon, Stoa sends it as `X-API-Key`.

**URL:** Your Komga base URL, e.g. `http://192.168.1.10:25600`

---

## Audiobookshelf

**What it shows:** In-progress audiobooks and podcasts with author, progress percentage, and remaining time. Includes a mini audio player — select an in-progress item to play it directly from the dashboard, with seek controls and automatic progress sync back to Audiobookshelf.

**Auth:** Two options:
- `username:password` — Stoa logs in and obtains a session token
- Bare API key — stored in your Audiobookshelf user account under Settings → Account

**URL:** Your Audiobookshelf base URL, e.g. `http://192.168.1.10:13378`

**Multi-file books:** For audiobooks split across multiple files, Stoa resolves which file to start from based on your saved progress and seeks to the correct position within that file.

**Height:** 1× shows stats only; 2–3× adds the in-progress item list; 4×+ adds the full mini player with controls.

---

## Navidrome

**What it shows:** Your music library playlists with a built-in player — browse playlists, see the track list, and play music directly from the dashboard. The active playlist is saved per panel.

**Auth:** Navidrome username and password in `username:password` format. Stoa uses the Subsonic API with MD5 token authentication.

**URL:** Your Navidrome base URL, e.g. `http://192.168.1.10:4533`

**TLS:** Enable "Skip TLS verify" for self-signed certificates.

**Height:** 1× shows the current playlist name and track count; 2–3× adds the playlist selector and scrollable track list; 4×+ adds the full player bar with album art, seek control, and prev/next.

---

## Authentik

**What it shows:** Login counts, failed login attempts, recent failure details, active sessions.

**Auth:** API token (Bearer). In Authentik: Admin Interface → Directory → Tokens → Create. Set the intent to "API".

**URL:** Your Authentik base URL, e.g. `https://auth.example.com`

---

## Jellyfin

**What it shows:** Active streams with user, media title, progress, and transcode vs. direct play status. Library counts by type (movies, shows, music, etc.). Server name and version.

**Auth:** API key. Create one in Jellyfin Dashboard → API Keys → +. The key goes in the secret field.

**URL:** Your Jellyfin base URL, e.g. `http://192.168.1.10:8096`

---

## Emby

**What it shows:** Active streams with user, media title, and progress. Library counts by type (movies, shows, music, etc.). Server version.

**Auth:** API key. In Emby: Admin Dashboard → Advanced → API Keys → New API Key.

**URL:** Your Emby server base URL, e.g. `http://192.168.1.10:8096`

**TLS:** Enable "Skip TLS verify" for self-signed certificates.

---

## Jellystat

**What it shows:** Watch history, most played content, top users, views by library type over a configurable time range (7 / 30 / 90 days).

**Auth:** API key. In Jellystat: Settings → API Keys → Generate.

**URL:** Your Jellystat base URL, e.g. `http://192.168.1.10:3000`

**TLS:** Enable "Skip TLS verify" for self-signed certificates.

---

## Tracearr

**What it shows:** Live stream count, watch history, recent plays, top users, account-sharing violations (unacknowledged flagged sessions) across Plex, Jellyfin, and Emby.

**Auth:** API key (Bearer token). In Tracearr: Settings → API Keys → Create.

**URL:** Your Tracearr base URL, e.g. `http://192.168.1.10:7880`

---

## Home Assistant

**What it shows:** Entity states for your smart home devices. You can display all entities or filter by specific entity IDs or domains (e.g. `sensor`, `light`, `switch`). Shows friendly name, state, unit, and time of last change.

**Auth:** Long-lived access token. Create one in Home Assistant → Profile (bottom-left avatar) → Long-Lived Access Tokens → Create Token.

**URL:** Your Home Assistant base URL, e.g. `http://homeassistant.local:8123`

**Filtering:** In the panel config, enter specific entity IDs (comma-separated) or domain names to narrow what's shown. Without a filter, all entities are displayed.

---

## Overseerr / Jellyseerr

**What it shows:** Media request counts by status (pending, processing, available, declined, total), a breakdown by movie vs. TV, and a list of recent pending requests. Update availability indicator.

**Auth:** API key. Find it in Overseerr/Jellyseerr → Settings → General → API Key.

**URL:** Your Overseerr or Jellyseerr base URL, e.g. `http://192.168.1.10:5055`

---

## Steam

**What it shows:** Player profile (username, avatar, online/offline/in-game status, current game), owned game count and total hours, top 10 games by playtime, games played in the last 2 weeks, recent achievement unlocks, and Steam store sales and new releases.

**Auth:** Steam Web API key. Get one at [https://steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey). Store it as a secret.

**URL:** Your Steam ID (64-bit numeric ID, e.g. `76561198012345678`). This goes in the URL field — it's used as the account identifier, not a server address.

**Finding your Steam ID:** Open your Steam profile in a browser. The URL contains your Steam ID (`/profiles/76561198...`). If your profile uses a custom URL (`/id/yourname`), Stoa can resolve it — enter your vanity name in the URL field and Stoa will look up the numeric ID automatically.

**Note:** The Steam API returns public profile data only. If a user's profile is set to private in Steam privacy settings, library data will not be available.

---

## Sports (ESPN)

**What it shows:** Scores, standings, and schedules for NHL, NFL, NBA, and MLB. Data is sourced from ESPN's public API.

**Auth:** None required.

**URL:** Not required — no server to point to.

**Setup:** Create a Sports integration with no URL or secret, then create a panel. In the panel config, select the sport and league.

---

## Stocks

**What it shows:** US stock quotes with mini sparklines for recent price movement.

**Auth:** None required — data is sourced from Yahoo Finance.

**URL:** Not required.

**Setup:** Create a Stocks integration (no URL or secret needed), then create a panel and enter the ticker symbols you want to track.

---

## Crypto

**What it shows:** Cryptocurrency prices with sparklines for recent price movement, sourced from CoinGecko.

**Auth:** Optional. The public CoinGecko API works without a key but has strict rate limits. For higher limits, create a free Demo API key at coingecko.com and store it as a secret.

**URL:** Not required.

---

## Weather

**What it shows:** Current conditions (temperature, feels-like, wind, humidity) and a multi-day forecast. Data is sourced from Open-Meteo.

**Auth:** None required.

**URL:** Not required.

**Setup:** Create a Weather integration (no URL or secret needed), then configure the panel with your location (city name or latitude/longitude).

---

## RSS / Atom

**What it shows:** Items from any RSS or Atom feed — title, summary, and link.

**Auth:** Optional Bearer token for password-protected feeds. Leave the secret empty for public feeds.

**URL:** Not required at the integration level — the feed URL is configured per panel.

---

## Custom API

A generic panel for services not natively supported. Makes a GET request to any URL and displays the JSON response.

**Auth:** Optional Bearer token. Leave the secret empty for unauthenticated endpoints.

**URL:** The full endpoint URL to call, e.g. `http://192.168.1.10:8080/api/status`

**Display:** The full JSON response is rendered as formatted text. Best suited for simple status endpoints.

---

## Google Calendar

Google Calendar requires a two-step setup:

1. **Admin → Google Calendar:** Enter your Google Cloud OAuth credentials (Client ID and Client Secret). Get these from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID. Enable the Google Calendar API. Add your Stoa URL + `/api/google/callback` as an authorized redirect URI.

2. **Connect accounts:** After saving credentials, click "Connect Google Account" to authorize. Each connected account can expose multiple calendars, which can be added as panel sources.

Events appear on the dashboard as a calendar panel showing upcoming appointments. The days-ahead window (how far into the future to fetch events) is configurable per source — choose from 7, 14, 30, 60, or 90 days in Profile → Integrations → Calendar Sources.

**Non-routable domains and OAuth:** Google's OAuth redirect URI validation requires the callback URL to be reachable from the internet — or at minimum, to be a valid registered hostname. If Stoa runs on a local TLD like `.local`, `.lan`, or `.home.arpa`, Google may reject the redirect URI registration.

Workarounds:
- **Use your router's DNS override** to make a real domain (e.g. `stoa.yourdomain.com`) resolve to your local IP, then register that URL as the redirect URI.
- **Use a local IP address** as the authorized redirect URI (e.g. `http://192.168.1.10:8080/api/google/callback`). Google accepts IP addresses for development credentials.
- **Use an SSH tunnel or VPN** to expose Stoa temporarily during the OAuth authorization step, then remove the tunnel afterward — the refresh token persists.

---

## Notes on TLS

Most home network services use self-signed certificates. Stoa will detect TLS certificate errors and report them — enable **"Skip TLS verify"** on the integration to bypass certificate validation. This is safe on a trusted home network.

Stoa also handles TLS renegotiation automatically (relevant for TrueNAS, which renegotiates every 60 seconds).
