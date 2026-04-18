# Integrations

Integrations connect Stoa to your services. Each panel needs an integration to pull its data from.

---

## How credentials work

Stoa stores credentials in **secrets** — encrypted at rest, never exposed in full after saving. When you create an integration you select a secret to authenticate with.

Different services use different authentication schemes. Stoa normalises these behind a single "API key" field in the secret, but the format of what you store varies:

| Format | Used by | Why |
|---|---|---|
| Plain API key | Sonarr, Radarr, Lidarr, TrueNAS, Authentik, Kuma, Gluetun | These services issue a single opaque token |
| `key:secret` | OPNsense, Transmission, PhotoPrism | These services use HTTP Basic Auth with two separate values |
| `user@realm!tokenid:secret` | Proxmox | Proxmox API token format — the full token string goes in the Authorization header |
| Token (query param) | Plex | Plex appends `X-Plex-Token` to every request URL |
| API key (query param) | Tautulli | Tautulli appends `apikey` to every request URL |

**Why `key:secret` as a single field?** HTTP Basic Auth requires both a username and password. Rather than two separate secret fields, Stoa uses the convention `username:password` stored as one secret. The colon is the separator — Stoa splits on the first colon when making requests. This is the same format curl uses with `-u key:secret`.

---

## Sonarr

**What it shows:** Upcoming episode schedule, recently downloaded episodes, wanted/missing episodes, series count, episode count.

**Auth:** Plain API key. Find it in Sonarr → Settings → General → API Key.

**URL:** Your Sonarr base URL, e.g. `http://192.168.1.10:8989`

**TLS:** Enable "Skip TLS verify" if using a self-signed certificate.

---

## Radarr

**What it shows:** Upcoming movie releases, recently downloaded movies, wanted/missing movies, movie count.

**Auth:** Plain API key. Find it in Radarr → Settings → General → API Key.

**URL:** Your Radarr base URL, e.g. `http://192.168.1.10:7878`

---

## Lidarr

**What it shows:** Upcoming album releases, recently downloaded albums, wanted/missing albums, artist and track counts.

**Auth:** Plain API key. Find it in Lidarr → Settings → General → API Key.

**URL:** Your Lidarr base URL, e.g. `http://192.168.1.10:8686`

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

Events appear on the dashboard as a calendar panel showing upcoming appointments.

---

## Notes on TLS

Most home network services use self-signed certificates. Stoa will detect TLS certificate errors and report them — enable **"Skip TLS verify"** on the integration to bypass certificate validation. This is safe on a trusted home network.

Stoa also handles TLS renegotiation automatically (relevant for TrueNAS, which renegotiates every 60 seconds).
