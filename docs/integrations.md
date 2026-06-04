# Integrations

Integrations connect Stoa to your services. Each panel needs an integration to pull its data from.

---

## How credentials work

Stoa stores credentials in **secrets** — encrypted at rest, never exposed in full after saving. When you create an integration you select a secret to authenticate with.

Different services use different authentication schemes. Stoa normalises these behind a single "API key" field in the secret, but the format of what you store varies:

| Format | Used by | Why |
|---|---|---|
| Plain API key | Sonarr, Radarr, Lidarr, TrueNAS, Unraid, Authentik, Kuma | These services issue a single opaque token |
| `username:password` | OMV, Synology, QNAP, Transmission, PhotoPrism, Gluetun | Stoa logs in with these credentials and uses a session token (or passes them as Basic Auth). The colon separates the username from the password — Stoa splits on the first colon. |
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

## PhotoPrism

**What it shows:** Photo and video counts, library size, recent imports, indexing status.

**Auth:** PhotoPrism username and password in `username:password` format. Stoa logs in via the PhotoPrism API and uses the session token for subsequent requests.

**URL:** Your PhotoPrism base URL, e.g. `http://192.168.1.10:2342`

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
