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
| `username:password` or bare API key | Komga, Audiobookshelf, pfSense | If the value contains a colon, Stoa uses Basic Auth (Komga, pfSense) or logs in as a user (Audiobookshelf). If there is no colon, the value is treated as a direct API key. |
| No secret, `username:password`, or Bearer token | Traefik | Three auth modes: open API (no secret required), HTTP Basic Auth (`username:password`), or a bare Bearer token. |
| Bearer token or `email:globalApiKey` | Cloudflare | Scoped API token (recommended — no colon) or legacy Global API Key with your account email (`you@example.com:globalkey`). |
| Bare token (v5) or bare password (v6) | Pi-hole | v5: API token from Settings → API (appended as `?auth=<token>`). v6: web interface password or an app password (used to obtain a 30-minute session ID). Stoa auto-detects the version at connection time. |
| `username:password` | AdGuard Home | HTTP Basic Auth on every request — Stoa splits on the first colon and sets the `Authorization: Basic` header. |
| Plain API key | NextDNS | Bare API key sent as `X-Api-Key` header on every request. |
| `email:password` → JWT session | Nginx Proxy Manager | Stoa posts credentials to `POST /api/tokens` and caches the returned JWT for up to 23 hours. |
| Password only → session cookie | wg-easy | Stoa posts the password to `POST /api/session` and caches the returned session cookie for up to 23 hours. Leave blank for no-auth instances. |
| Bearer token | Tailscale | API token (`tskey-api-...`) sent as `Authorization: Bearer` on every request. Generated in the Tailscale admin console. |
| None, `username:password`, or bare Bearer token | Prometheus | Three auth modes: open (no secret), HTTP Basic Auth (`username:password`), or a bare Bearer token. Most home-lab Prometheus instances run open or behind a firewall. |
| Bearer token (Service Account) | Grafana | Service Account token generated in Grafana → Administration → Service Accounts. Sent as `Authorization: Bearer`. |
| Plain API key | autobrr | API key from autobrr → Settings → API. Sent as `X-API-Token` header on every request. |
| Plain API key | Bazarr | API key from Bazarr → Settings → General → Security. Sent as `X-API-KEY` header on every request. |
| Plain API key | Prowlarr | API key from Prowlarr → Settings → General → Security. Sent as `X-Api-Key` header on every request. |
| Bearer token or none | Frigate | Optional — leave blank for unauthenticated local instances. For authenticated instances, Bearer token from Frigate → Settings → Users. Sent as `Authorization: Bearer`. |
| `username:password` | Blue Iris | Blue Iris user account credentials. Stoa computes `MD5(username:session:password)` per the Blue Iris JSON API session protocol. |
| `username:password` | Nextcloud | Nextcloud account credentials — use an app password from Nextcloud → Settings → Security → App passwords. Sent as HTTP Basic Auth with `OCS-APIRequest: true` header. |
| Personal Access Token | Netbird | PAT from Netbird → Settings → Personal Access Tokens. Sent as `Authorization: Token <PAT>`. |
| Personal Access Token | Firefly III | PAT from Firefly III → Profile → OAuth → Personal Access Tokens. Sent as `Authorization: Bearer <token>`. |
| API key | Actual Budget | API key set via `API_KEY` env var on the `actual-http-api` sidecar. Sent as `x-api-key` request header. |
| Security token → JWT | Ghostfolio | Security token from Ghostfolio → User Account → Security Token. Stoa exchanges it for a short-lived JWT via `POST /api/v1/auth/anonymous` and uses the JWT as `Authorization: Bearer`. |
| `apiKey:apiSecret` | Coinbase | Read-only API key + secret from Coinbase → Settings → API. Store as `apiKey:apiSecret` (colon-separated). Stoa signs every request with HMAC-SHA256. |
| None | Scrutiny | No authentication required. Scrutiny runs unauthenticated by default. Leave the API key field blank. |
| API token | Paperless-ngx | Token generated in Paperless-ngx → Settings → API → Generate Token. Stoa sends it as `Authorization: Token <token>`. |
| API token (Bearer) | Mealie | Long-lived API token from Mealie → User Settings → API Tokens. Stoa sends it as `Authorization: Bearer <token>`. |
| API key | Grocy | API key from Grocy → Manage API Keys (or Settings → User API Keys). Sent as `GROCY-API-KEY` request header on every request. |
| Password only | Deluge | Deluge Web UI authenticates with just a password (no username). |
| `key:secret` | OPNsense | OPNsense issues a two-part API credential (key + secret). Stoa joins them with a colon and authenticates via HTTP Digest. |
| `user@realm!tokenid:secret` | Proxmox | Proxmox API token format — the full token string goes in the Authorization header |
| Token (query param) | Plex | Plex appends `X-Plex-Token` to every request URL |
| API key (query param) | Tautulli | Tautulli appends `apikey` to every request URL |
| Bearer token | Monica, Pterodactyl | Token created in the service's UI and sent as `Authorization: Bearer`. |
| `email:password` | Homebox, Fittrackee | Stoa logs in via the service's auth endpoint and uses the returned session token. |
| Plain API key (`Token` header) | wger | Permanent API key from wger Dashboard → API. Stoa sends it as `Authorization: Token <key>`. |
| `account:password` | Docspell | Account is `collective/user` for multi-collective setups, or just `user` for single-collective. Stoa exchanges credentials for a session token. |
| `username:password` or bare bearer | RomM, Maintainerr | If the value contains a colon, Stoa uses Basic Auth. If no colon, it's sent as `Authorization: Bearer`. |
| No auth, `username:password`, or bare bearer | Tdarr | Tdarr runs unauthenticated by default (leave blank). API key from Tdarr → Tools → API Keys for single-token auth. `username:password` for a reverse-proxy Basic Auth layer. |
| `clientId:clientSecret` → OAuth | Spotify | App credentials from Spotify Developer Dashboard. Used to authorize Stoa's OAuth flow — store as `clientId:clientSecret`. Connect your user account from the integration edit page after saving. |
| `username:apiKey` | Last.fm | Last.fm username and API key, colon-separated. API key from last.fm/api (free, no OAuth required). |
| `clientId:clientSecret` → OAuth | Strava | App credentials from Strava API settings (`strava.com/settings/api`). Stoa exchanges these for user access and refresh tokens via OAuth 2.0 Authorization Code flow. Connect your account from the integration edit page after saving. |
| `username:password` | Duolingo | Your Duolingo account login credentials. Stoa uses the unofficial Duolingo API to fetch your stats — credentials are used to obtain a session JWT, which is cached for 12 hours. |

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

## Cloudflare

**What it shows:** All zones managed by your account with 24-hour analytics (requests, cached requests, threats blocked, bandwidth, unique visitors). Cloudflare Tunnel status — each tunnel shows healthy/degraded/down/inactive, which PoPs it's connected through (colo codes), and its full ingress rule table (hostname → local service).

**Auth:** API token (recommended) — create one at dash.cloudflare.com → My Profile → API Tokens. The token needs:
- Zone → Zone → Read
- Zone → Analytics → Read
- Account → Cloudflare Tunnel → Read

Store the bare token in the API key field. Leave the URL field blank.

**Legacy auth:** Store `email:globalApiKey` (your Cloudflare login email, colon, your Global API Key). Global API Key has full account access; API tokens are preferred.

**Analytics:** The 24h window uses the last 1440 minutes. The analytics dashboard endpoint is available on all plans including Free. Data has approximately 1-minute resolution but is sampled — exact numbers may differ slightly from the Cloudflare dashboard.

**Tunnels:** Requires your account to have Cloudflare Tunnel configured. If no tunnels exist, the panel shows zones only. Ingress rules are fetched from the tunnel configuration; only named hostname rules are shown (the catch-all fallback is omitted).

**Polling:** Every 5 minutes (Cloudflare's analytics API has rate limits and 1-minute data resolution makes faster polling pointless).

---

## Pi-hole

**What it shows:** DNS query statistics for the last 24 hours — total queries, blocked queries, block percentage, unique clients, unique domains queried, and gravity (blocklist) size. A 24-hour query timeline (10-minute buckets) with blocked queries overlaid as a red bar. Top blocked domains, top querying clients, query type breakdown (A, AAAA, CNAME, PTR, MX, etc.), and upstream DNS resolver distribution.

**API versions:** Pi-hole ships two distinct API generations:
- **v5** (PHP-based): accessed at `/admin/api.php`. Authenticated via API token appended as `?auth=<token>`.
- **v6** (FTL-native): REST API built into the FTL binary at `/api/`. Authenticated with the web interface password or an app password — Stoa posts credentials to `/api/auth` and receives a 30-minute session ID.

Stoa auto-detects the version by probing `GET /api/info/version` — if that endpoint responds 200, v6 is used; otherwise v5. The result is cached per integration so detection only happens once.

**Auth:** Bare token or password in the secret field (no colon prefix):
- **v5:** Copy the API token from Pi-hole Web Interface → Settings → API → Show API token. Paste the bare token.
- **v6:** Use your web interface password, or create an app password in Settings → Web Interface → API → App passwords. App passwords are recommended — they can be revoked independently of your main password.
- **No auth (v5 only):** Pi-hole v5 exposes basic summary stats without authentication. Leave the secret empty and Stoa will still fetch total queries, blocked percentage, and client/domain counts. Top blocked domains, top clients, and over-time data require auth.

**URL:** Your Pi-hole base URL, e.g. `http://192.168.1.10` or `http://pihole.local`. Do not include `/admin` — Stoa appends the correct path automatically.

**Port:** Pi-hole's web interface and v6 FTL API both default to port 80 (HTTP). Include the port in the URL only if you've changed it.

**TLS:** Enable "Skip TLS verify" for self-signed certificates. Pi-hole does not use TLS by default.

**Polling:** Every 30 seconds. Pi-hole has no real-time push (no SSE or WebSocket). The over-time data uses 10-minute buckets, so faster polling would not produce new data.

**Blocking status:** Stoa shows a live indicator (green = blocking active, red = blocking disabled). Blocking can be paused from the Pi-hole web interface without affecting stats collection.

---

## AdGuard Home

**What it shows:** DNS query statistics — total queries, blocked queries, block percentage, and a breakdown by protection category (blocklist filtering, Safe Browsing, Safe Search, Parental Control). A query timeline with blocked queries overlaid (bucketed by hour or day). Top blocked domains, top querying clients, top queried domains, upstream DNS resolver breakdown with average response times, and the active blocklist inventory with per-list rule counts.

**Auth:** AdGuard Home uses HTTP Basic Authentication on all API requests. Store credentials as `username:password` in the secret field — the same format as your AdGuard Home web login. Stoa splits on the first colon and sends `Authorization: Basic <base64>` with every request.

The default AdGuard Home admin credentials are `admin` and whatever password you set during the initial setup wizard.

**URL:** Your AdGuard Home base URL, e.g. `http://192.168.1.10:3000`. The API is served at the same address as the web interface. Do not include `/control` — Stoa appends the correct path automatically.

**Port:** AdGuard Home defaults to port `3000` (HTTP) for the web interface and API during initial setup. After setup completes, you can reconfigure it to port `80` or `443`. Use whichever port your instance runs on.

**TLS:** Enable "Skip TLS verify" for self-signed certificates. AdGuard Home supports HTTPS if you configure a certificate; most home users run it on plain HTTP.

**Safe Browsing / Safe Search / Parental Control:** If these features are enabled in AdGuard Home, Stoa shows separate counters for how many queries were intercepted by each protection category. They appear as stat chips in the 2× and 4× panel layouts. If all three are zero (features disabled), the chips are hidden.

**Blocklists:** The 4× panel shows your complete blocklist inventory — each list by name, its rule count, and a proportional bar showing what fraction of total rules it contributes. Disabled lists are shown with a strikethrough.

**Upstream DNS resolvers:** AdGuard Home tracks which upstream servers answered queries and how long each took. Stoa shows these in the 4× layout under "Upstreams" with per-server average response times — useful for spotting a slow upstream or confirming that DoH/DoT is working.

**Polling:** Every 30 seconds. AdGuard Home has no real-time push API (no SSE or WebSocket). The stats time series uses hourly or daily buckets depending on your AdGuard stats interval setting; faster polling does not produce new time-series data.

---

## NextDNS

**What it shows:** DNS analytics for the last 24 hours — total queries, blocked queries, allowed queries, block percentage, encrypted query percentage, and IPv6 query percentage. A 24-hour hourly query timeline with blocked queries overlaid as red bars. Top blocked domains ranked by block count, top querying clients, and a block reason breakdown showing which NextDNS security features (Denylist, Regex, Threat Intelligence Feeds, SafeBrowsing, etc.) triggered each block.

**Cloud-only:** NextDNS is a cloud DNS service. All queries are processed by NextDNS servers and analytics are fetched via the NextDNS REST API at `api.nextdns.io`. There is no self-hosted component — no local server to configure.

**Auth:** Bare API key from your NextDNS account → Account → API. Sent as `X-Api-Key: <key>` header on every request. Do not include a colon or username — it is a plain token.

**URL:** `https://api.nextdns.io/profiles/{profileId}` — where `{profileId}` is the 6-character ID of your NextDNS profile. You can find it in the NextDNS dashboard URL (e.g. `https://my.nextdns.io/abc123/setup` → profileId is `abc123`), or in your NextDNS → Settings → Profile ID.

**UI URL:** Optional. Defaults to `https://my.nextdns.io` if left blank. The panel header links to this URL.

**Profile name:** Stoa fetches the profile's display name from the NextDNS API and shows it in 2× and 4× panel layouts.

**Block reasons:** NextDNS categorises each blocked query by the security feature that triggered the block. Common reasons include: `Denylist` (manual blocklist), `Regex` (regex rule), `Threat Intelligence Feeds`, `SafeBrowsing`, and `Adult & Explicit Content`. Stoa shows these with proportional bars so you can see which protection categories are doing the most work.

**Top blocked domains:** Derived from the `/analytics/domains` endpoint by filtering to entries where `blocked > 0` and sorting by block count descending. Not a separate API call.

**Polling:** Every 30 seconds. NextDNS has no real-time push (no SSE or WebSocket). The time-series data uses 1-hour buckets, so faster polling would not produce new timeline data.

**TLS:** NextDNS is always HTTPS (`api.nextdns.io`). The "Skip TLS" option has no effect for this integration.

---

## Nginx Proxy Manager

**What it shows:** Proxy host inventory — every configured reverse proxy rule with its domain name, forward target (scheme, host, port), enabled/disabled status, and SSL status. A certificate expiry dashboard showing all SSL certificates sorted by urgency (expired and nearest-expiry first), with color-coded countdown: red for expired, orange for less than 7 days, amber for less than 30 days, green for healthy. Redirect host inventory, TCP/UDP stream counts, and access list count.

**Auth:** NPM uses its own session API. Store your login credentials as `email:password` in the secret field — the same credentials you use to log in to the NPM web UI. Stoa posts these to `POST /api/tokens` and receives a JWT bearer token, which is cached for 23 hours and refreshed automatically. The actual NPM token lasts 30 days, but Stoa refreshes proactively to stay ahead of expiry.

**URL:** Your Nginx Proxy Manager base URL, e.g. `http://192.168.1.10:81`. NPM's admin UI and API both default to port `81`. Do not include `/api` — Stoa appends the correct path.

**UI URL:** Optional. If set, the panel header links to this URL. Typically the same as the API URL.

**Port:** NPM defaults to port `81` for the admin web interface (not port 80, which is used for proxied traffic). Port `81` is the API port. If you've changed this in your NPM configuration or put NPM behind another reverse proxy, use the appropriate URL.

**TLS:** Enable "Skip TLS verify" for self-signed certificates. NPM itself does not use TLS on its admin port by default.

**What each category shows:**
- **Proxy hosts:** All reverse proxy entries with domain → target mapping, enabled/disabled status (green/grey dot), and SSL padlock indicator. Sorted enabled-first, then alphabetically.
- **Certificates:** All SSL certificates with expiry countdown. Sorted by urgency (expired first, then by days remaining). Each shows the primary domain name, Let's Encrypt badge where applicable, and days remaining colored by urgency.
- **Redirects:** HTTP redirect entries (e.g. `http://foo.com → https://foo.com`) with enabled status.
- **Streams:** TCP/UDP stream proxy count (enabled/total).
- **Access lists:** Count of IP/auth access control lists configured.

**Certificate urgency colors:**
- Red: expired (daysLeft < 0)
- Orange: expiring within 7 days
- Amber: expiring within 30 days
- Green: healthy (more than 30 days remaining)

**Let's Encrypt badge:** Certificates issued via Let's Encrypt (managed by NPM's built-in Certbot integration) are marked with a `LE` badge. These auto-renew at 30 days; if you see an LE cert in the amber zone something may have gone wrong with renewal.

**Polling:** Every 60 seconds. NPM has no real-time push (no SSE or WebSocket). Certificate expiry data changes slowly; host enable/disable state changes only when you manually toggle it in the UI.

---

## wg-easy

**What it shows:** WireGuard VPN server status (running/stopped, listen address, port) and a full client roster — each client's name, IP address, connected state (based on WireGuard handshake recency), last handshake time, and cumulative transfer stats (bytes sent to and received from each client). Summary counters for connected, enabled, disabled, and total clients, plus aggregate transfer totals.

**Connection detection:** WireGuard handshakes occur every ~2 minutes while a peer is active. A client is considered "connected" if its last handshake was within 180 seconds (3 minutes). This matches the wg-easy UI's own connected indicator.

**Auth:** Bare password only — just your wg-easy web UI password in the API key field. Stoa posts it to `POST /api/session` and receives a session cookie, which is cached for 23 hours and refreshed automatically.

Leave the API key field blank if your wg-easy instance has no password set (the `PASSWORD` environment variable is not configured). Stoa will make unauthenticated requests.

**URL:** Your wg-easy base URL, e.g. `http://192.168.1.10:51821`. The default wg-easy web UI and API port is `51821`.

**UI URL:** Optional. If set, the panel header links to this URL. Defaults to the API URL.

**API version compatibility:** wg-easy's API changed across versions:
- **v14 and earlier:** Clients returned under `latestHandshakeAt` field. Responses are bare arrays.
- **v15+:** Field renamed to `lastHandshake`. Responses are wrapped in `{"status":"success","data":...}`. Some builds also have a `transferTy` typo for the `transferTx` field.

Stoa handles all variants automatically — it checks both field names and unwraps the response envelope.

**No SSE or WebSocket:** wg-easy has no real-time push API. Stoa polls every 30 seconds. Since WireGuard handshakes occur every 2 minutes, 30-second polling is sufficient to keep the connected status accurate.

**TLS:** Enable "Skip TLS verify" for self-signed certificates. wg-easy does not use TLS by default.

---

## Tailscale

**What it shows:** Your Tailscale mesh VPN device roster — every device's name, hostname, Tailscale IP address, operating system, assigned user, and online/offline status. Summary counters for online, offline, and total devices, plus role identification (exit nodes and subnet routers), update availability alerts, key expiry warnings, and unauthorized device flags.

**What is Tailscale?** Tailscale is a cloud-managed mesh VPN built on WireGuard. It creates a private network (tailnet) of your devices where each device gets a `100.x.x.x` Tailscale IP address. Unlike traditional VPNs, there is no central server — devices connect peer-to-peer through Tailscale's coordination server. Stoa queries the Tailscale management API to show your device fleet.

**Auth:** Tailscale API token in `tskey-api-XXXXX` format. Generate one at [login.tailscale.com → Settings → Keys](https://login.tailscale.com/admin/settings/keys). The token must be created by an Owner, Admin, IT admin, or Network admin. Tokens expire in 1–90 days (your choice at creation time) — Stoa will stop working when the token expires; rotate it before that happens.

Store the bare token string as the API key secret.

**URL:** Leave blank. Stoa always calls `https://api.tailscale.com` — there is no local server to point to. Optionally enter your tailnet domain name (e.g. `example.com`) in the URL field if using an explicit tailnet rather than the default. The default (`-`) resolves to the tailnet associated with your API key.

**UI URL:** Optional. The panel header links to this URL. Defaults to `https://login.tailscale.com/admin/machines` (the Tailscale admin machines page).

**Online status:** A device is considered online if `connectedToControl` is true — meaning it recently connected to the Tailscale coordination server. When offline, the `lastSeen` timestamp shows when it last checked in.

**Exit nodes:** Devices with `0.0.0.0/0` or `::/0` in their approved routes (`enabledRoutes`) are flagged as exit nodes. Exit nodes forward all internet traffic from other tailnet devices.

**Subnet routers:** Devices with non-exit-node routes in `enabledRoutes` are flagged as subnet routers. These devices advertise local network subnets (e.g. `192.168.1.0/24`) to the rest of the tailnet so other Tailscale devices can reach local machines.

**Key expiry:** By default, Tailscale device keys expire after 180 days of inactivity (configurable per device). Stoa warns when a device key expires within 30 days, and flags keys that are already expired. Key expiry can be disabled per device in the Tailscale admin console.

**Update available:** When `updateAvailable` is true on a device, Stoa shows an UPDATE badge. This means a newer Tailscale client version is available for that device.

**Unauthorized devices:** Devices with `authorized: false` are flagged with a red dot. These are devices that have joined your tailnet but not yet been approved by an admin.

**Tags:** Tailscale tags (e.g. `tag:server`, `tag:router`) are shown as pills on device rows. In the 4× panel, all unique tags across your fleet are listed at the bottom.

**External devices:** Devices shared from other tailnets appear in the list. They have fewer fields populated (`clientVersion` is empty, `updateAvailable` is always false). They are identified by `isExternal: true`.

**Polling:** Every 60 seconds. The Tailscale API is REST-only with no SSE or WebSocket. Tailscale's control server itself detects device presence; `connectedToControl` reflects near-real-time status.

**No TLS setting:** The "Skip TLS verify" option has no effect for this integration — Tailscale's API is always HTTPS at `api.tailscale.com`.

---

## Prometheus

**What it shows:** Scrape target health grouped by job (up/total per job, overall health percentage), any active alerting rules that are firing or pending with severity labels and human-readable summaries, the Prometheus server version, and — optionally — custom metric stat cards driven by PromQL expressions you configure per panel.

**What is Prometheus?** Prometheus is an open-source time-series metrics database and monitoring system. It scrapes metrics from configured targets (exporters running alongside your services), stores them as labeled time series, and evaluates alerting rules. It is the de facto metrics backend for homelab and production Kubernetes environments. The Prometheus HTTP API is the source Stoa queries — not any specific exporter.

**Auth:** Prometheus has no built-in authentication. Three modes are supported:

- **No auth (default):** Leave the API key field blank. Most home-lab Prometheus instances run open on a local port.
- **Basic Auth** (`username:password`): If your Prometheus is behind a reverse proxy (Nginx, Traefik, Caddy) with HTTP Basic Auth, put `user:pass` in the API key field. Stoa sends `Authorization: Basic ...` on every request.
- **Bearer token**: If your setup uses token-based auth, put the bare token in the API key field. Stoa sends `Authorization: Bearer ...`.

**URL:** Your Prometheus base URL, e.g. `http://192.168.1.10:9090`. Do not include `/api` — Stoa appends the correct paths automatically.

**TLS:** Enable "Skip TLS verify" if Prometheus is behind a reverse proxy with a self-signed certificate.

**Polling:** Every 30 seconds. Prometheus has no SSE or WebSocket push — Stoa polls the REST API. Alert state changes and target health changes are reflected within one poll cycle.

**What the panel always shows (no configuration needed):**
- **Target health:** Each scrape target's up/down/unknown state. Grouped by job (e.g. `node_exporter`, `cadvisor`, `blackbox`) with a per-job up/total count.
- **Active alerts:** Any alerting rule currently in `firing` or `pending` state, with name, severity label, `summary` annotation, and time active. Sorted firing-first.
- **Server version:** Fetched from `GET /api/v1/status/buildinfo`. Displayed as a chip; omitted if the endpoint is unavailable (older Prometheus versions).

**Custom PromQL metrics (configured per panel):**
In the panel configuration form, you can add up to 8 custom metric cards. Each card has a label, a PromQL expression, and an optional unit suffix. Stoa evaluates each expression as both an instant query (current value) and a 60-minute range query (30 data points, 2-minute step) to render a sparkline alongside the value.

If your PromQL expression returns multiple series (e.g. per-CPU metrics), Stoa sums the values. Use aggregation functions (`sum(...)`, `avg(...)`) in your expressions to control this.

Example PromQL expressions:

| Label | Query | Unit |
|---|---|---|
| CPU | `100 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100` | `%` |
| Memory used | `100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)` | `%` |
| Disk I/O | `rate(node_disk_read_bytes_total[5m]) + rate(node_disk_written_bytes_total[5m])` | `B/s` |
| HTTP error rate | `rate(http_requests_total{status=~"5.."}[5m])` | `req/s` |
| Active connections | `pg_stat_activity_count` | `` |
| Uptime | `time() - process_start_time_seconds` | `s` |

These expressions work with [node_exporter](https://github.com/prometheus/node_exporter) for host metrics. Your actual metric names depend on which exporters you run.

**No metrics shown?** If your Prometheus has no scrape targets configured, the targets section will show 0/0 up. This is normal for a freshly installed Prometheus. Configure scrape jobs in your `prometheus.yml` to start seeing data.

**Alertmanager:** Stoa queries Prometheus alerting rules directly via `/api/v1/alerts`, not the Alertmanager API. Only alerts evaluated by Prometheus itself appear here — alerts routed through Alertmanager's silence or inhibition rules may still show as firing.

---

## Grafana

**What it shows:** Datasource health for every configured datasource (Prometheus, Loki, InfluxDB, PostgreSQL, etc.) with a per-type color badge, any firing alerts from Grafana's built-in alerting engine with severity and time active, Grafana instance info (version, database state, org name), and — when the Service Account has Admin role — dashboard and user counts.

**What is Grafana?** Grafana is an open-source observability and dashboarding platform. It connects to backend data sources (Prometheus, InfluxDB, Loki, Elasticsearch, SQL databases, cloud monitoring APIs, and many more), visualises their data as panels and dashboards, and runs its own alerting engine on top of those sources. Stoa's Grafana integration surfaces the operational health of the Grafana instance itself — datasource connectivity and active alerts — rather than replicating its dashboards.

**Auth:** Service Account token (recommended) or a legacy API key. To create a Service Account token:

1. In Grafana, go to **Administration → Service Accounts** (or **Configuration → API Keys** for older versions).
2. Create a new Service Account with **Viewer** role (sufficient for datasources and alerts). Add **Admin** role if you want dashboard and user counts from the `/api/admin/stats` endpoint.
3. Click the Service Account → **Add service account token** → Copy the token.
4. Paste the token into the API key field in Stoa.

**URL:** Your Grafana base URL, e.g. `http://192.168.1.10:3000`. Do not include trailing slashes or path segments.

**TLS:** Enable "Skip TLS verify" if Grafana is behind a reverse proxy with a self-signed certificate.

**Polling:** Every 60 seconds. Datasource health checks and alert state are re-fetched each cycle.

**What the panel shows:**

- **Datasource health:** Each datasource's health check result via `GET /api/datasources/{id}/health` (Grafana 8.3+). Displayed with the datasource name, type (color-coded by type — Prometheus, Loki, InfluxDB, etc.), and any error message. Requires Grafana 8.3 or later; on older versions datasources appear with "unknown" health.
- **Firing alerts:** Active (unsuppressed) alerts from Grafana's alerting engine via the Alertmanager v2 API. Shows alert name, severity, summary annotation, and time active. Sorted by severity (critical → error → warning → info).
- **Instance info:** Grafana version, database state (ok/error), org name, dashboard count, and user count (the latter two require Admin role).
- **Datasource type breakdown (4× panel):** A summary of datasource types present (e.g. Prometheus ×2, Loki ×1, PostgreSQL ×3).

**Role requirements:**

| Feature | Required role |
|---|---|
| Datasource list and health | Viewer |
| Active alerts | Viewer |
| Org name | Viewer |
| Dashboard count, user count | Admin (via `/api/admin/stats`) |

**Grafana alerting vs Prometheus alerting:** If your Grafana uses Mimir or Prometheus as a datasource and you have both a Prometheus integration and a Grafana integration, the alert lists may overlap — Grafana can evaluate the same Prometheus alerting rules through its "unified alerting" engine. They may also differ if Grafana has silences, inhibitions, or additional alert rules defined only in Grafana. Both integrations remain useful for confirming alerts are visible at each layer.

---

## Prowlarr

**What it shows:** Indexer health (ok / degraded / auto-blocked), protocol and privacy breakdown (torrent vs usenet, public vs private vs semi-private), per-indexer lifetime query and grab counts with average response time and failure rate, connected \*arr application sync status, and Prowlarr health check issues.

**What is Prowlarr?** Prowlarr is the indexer manager for the \*arr stack. It replaces Jackett by integrating directly with Sonarr, Radarr, Lidarr, Readarr, and other applications — managing all your indexers in one place and syncing them automatically to each app. Prowlarr supports both torrent and usenet indexers across public, semi-private, and private tiers.

**Auth:** Plain API key. In Prowlarr, go to **Settings → General → Security → API Key**. Paste it into the API key field in Stoa.

**URL:** Your Prowlarr base URL, e.g. `http://192.168.1.10:9696`. Do not include trailing slashes.

**TLS:** Enable "Skip TLS verify" if Prowlarr is behind a reverse proxy with a self-signed certificate.

**Polling:** Every 60 seconds.

**What the panel shows:**

- **Indexer health:** Each indexer's operational state. Prowlarr automatically tracks failures and temporarily blocks indexers that repeatedly fail. Health states: `ok` (green) — operating normally; `degraded` (amber) — has had recent failures but not yet blocked; `blocked` (red) — auto-blocked by Prowlarr until the `disabledTill` timestamp; `disabled` (grey) — manually disabled.
- **Protocol badges:** `TRN` (green) = torrent indexer; `NZB` (purple) = usenet/Newznab indexer.
- **Privacy badges:** `PVT` (cyan) = private indexer; `SEMI` (purple) = semi-private; `PUB` (grey) = public.
- **Indexer stats:** Lifetime query count, grab count, average response time, and query failure rate per indexer. Response times over 3 seconds are highlighted amber.
- **Connected apps:** Applications synced to this Prowlarr instance with their sync level (Full Sync / Add Only / Disabled).
- **Health issues:** System-level warnings and errors from Prowlarr's health check endpoint (same pattern as Sonarr/Radarr).
- **Version:** From `/api/v1/system/status`.

**Indexer auto-blocking:** When an indexer fails repeatedly, Prowlarr sets a `disabledTill` timestamp and stops querying it temporarily. Stoa reads this field and marks the indexer as "blocked" with the timestamp. Once the block expires and Prowlarr retries, the status returns to `ok` or `degraded`.

---

## Frigate

**What it shows:** Camera roster with per-camera detection FPS and skipped-frame stats, zone configuration per camera with object-type filters, recent detection events by label and confidence score, and detector inference speed (CPU / Coral TPU / GPU).

**What is Frigate?** Frigate is an open-source NVR (network video recorder) built around real-time AI object detection. It ingests RTSP streams from IP cameras, runs detection on every frame using a configurable detector (CPU, Google Coral TPU, NVIDIA/AMD GPU, or Intel OpenVINO), and records video clips and snapshots of detected objects. Cameras are grouped into zones — named regions within the camera's field of view — that can filter by object type (person, car, dog, etc.) and trigger recording, snapshots, or automations independently.

**Auth:** Optional. Many local Frigate instances run without authentication on port 5000 — leave the API key field blank in that case. If Frigate's built-in authentication is enabled (port 8971), generate a Bearer token in **Frigate → Settings → Users** and paste it into the API key field in Stoa. Stoa sends it as `Authorization: Bearer <token>`.

**URL:** Your Frigate base URL including the port:
- Unauthenticated: `http://192.168.1.10:5000`
- Authenticated: `http://192.168.1.10:8971`

**TLS:** Enable "Skip TLS verify" if Frigate is behind a reverse proxy with a self-signed certificate.

**Polling:** Every 15 seconds — Frigate events update frequently and detection stats change per-cycle.

**What the panel shows:**

- **Cameras:** Each camera's detection FPS, process FPS, and skipped FPS. Detection FPS is the rate at which the detector processes frames from that camera. Skipped FPS is how many frames per second the detector is dropping because it can't keep up — a high skipped ratio (> 25%) indicates the detector is undersized for the camera count or resolution.
- **Zones:** Named regions within each camera's field of view, with the object types configured to trigger detection in that zone. Zones with no object filter detect all object types.
- **Events:** The 10 most recent detection events across all cameras — label (person, car, dog, etc.), camera, zone (if any), time ago, and confidence score. High-confidence detections (≥ 85%) are shown in green.
- **Detectors:** Inference speed in milliseconds for each configured detector. < 10ms = green (fast hardware acceleration); 10–30ms = amber; > 30ms = red. A Coral TPU typically achieves 5–15ms; CPU typically 100–500ms.
- **Version and uptime:** From `/api/stats`.

**Live video:** The Frigate panel does not display live video — it focuses on detection data, zone configuration, and events. To display live camera streams, use a **Text/HTML** panel with an MJPEG `<img>` tag pointing to `http://frigate-host:5000/api/<camera_name>/stream`. See [panels.md](panels.md#texthtml) for examples.

---

## Blue Iris

**What it shows:** System signal (green/yellow/red), camera roster with per-camera online/recording/motion/alert/paused/PTZ status, active profile, profile list, recent system-wide alerts with AI memo, and per-camera trigger and clip counts.

**What is Blue Iris?** Blue Iris is a commercial Windows NVR (network video recorder) popular in the home security and homelab community. It ingests RTSP streams from IP cameras, records on motion or schedule, supports AI-powered object detection (person, vehicle, animal), and exposes a JSON HTTP API for programmatic control.

**Auth:** `username:password` in the API key field. Stoa uses Blue Iris's two-step session authentication: it first requests a session token from the server, then sends `MD5(username:session:password)` to authenticate. Use a Blue Iris user account — not a Windows account.

**Prerequisites:** Enable the Blue Iris web server before connecting. In Blue Iris, go to **Settings → Web server** and enable it. Note the port (default is 81). Create a user account if you want to restrict access (recommended over using the admin account).

**URL:** `http://192.168.1.x:81` — the IP of your Windows machine and the web server port configured in Blue Iris. Do not include a trailing slash or path.

**TLS:** Enable "Skip TLS verify" if Blue Iris is configured with HTTPS and a self-signed certificate.

**Polling:** Every 30 seconds.

**What the panel shows:**

- **Signal:** Blue Iris's system-wide operational signal — green = ok; yellow = warning; red = problem. This is Blue Iris's own internal assessment, controlled by the user or by Blue Iris rules.
- **Cameras:** Each camera's online/offline state, recording status, motion and alert indicators, paused state, PTZ capability, and group membership. Sorted: alerting/no-signal first, then online, then offline.
- **Profile:** Active schedule profile (e.g. "Away", "Home", "Night"). The full profile list is shown in 4× panels with the active one highlighted.
- **Alerts:** The 10 most recent alerts from `/json` with `cmd: alertlist` and `camera: @Index` (all cameras). Alert time, camera name, and AI memo (if Blue Iris AI recognition is enabled).
- **Per-camera stats:** Trigger count and clip count per camera (from camlist `nTriggers` and `clipsCreated` fields).
- **Admin flag:** Whether the authenticated user has admin role — shown as a badge in 4× panels.

**Live streams:** Blue Iris MJPEG streams are available at `http://host:port/mjpg/<camera_shortname>?user=<username>&pw=<password>`. The short name is the internal camera ID (not the display name) shown in the Blue Iris camera list. Use a **Text/HTML** panel to embed these. See [panels.md](panels.md#texthtml) for embed examples.

**Note:** Blue Iris is Windows-only and commercial software (one-time purchase). The JSON API is available in all versions of Blue Iris 5 and later.

---

## Nextcloud

**What it shows:** Active users in the last 5 minutes, 1 hour, and 24 hours; total users vs. enabled users; free storage space; number of files; share counts broken down by user shares, group shares, and public links; app update count; server info (PHP version, database type and version, webserver, and RAM usage).

**What is Nextcloud?** Nextcloud is an open-source self-hosted file sync and collaboration platform. It provides file storage, sharing, calendar, contacts, and a large app ecosystem. It is one of the most widely deployed self-hosted applications in the homelab community.

**Auth:** `username:password` in the API key field. Use an **app password** generated in **Nextcloud → Settings → Security → App passwords** — this is safer than using your main account password and can be revoked independently.

**URL:** Your Nextcloud base URL, e.g. `https://cloud.example.com`. Do not include trailing slashes or paths.

**TLS:** Enable "Skip TLS verify" if Nextcloud is behind a reverse proxy with a self-signed certificate.

**Polling:** Every 5 minutes.

**Requires:** The **Server Info** app must be installed and enabled in Nextcloud (it ships with Nextcloud and is enabled by default in most installations). Go to **Apps → Your apps** and confirm "Server Info" is enabled. Without it, the API endpoint returns a 404 and the panel will show an error.

**What the panel shows:**

- **Active users:** Users who have accessed Nextcloud in the last 5 minutes, 1 hour, and 24 hours (from `/activeUsers`). Shown as horizontal activity bars relative to total user count.
- **Storage:** Free space in human-readable format (bytes → KB → MB → GB → TB) and total number of files.
- **Shares:** Total shares, broken down by user-to-user, user-to-group, and public link shares.
- **Users:** Total users and disabled users. The "Users" chip shows `active/total` format.
- **App updates:** Highlighted amber badge if any installed apps have updates available.
- **Server info (4× only):** PHP version, database type and version, webserver name, and RAM used/total.
- **Memory donut (4× only):** Visual ring showing server RAM usage percentage. Green < 75%, amber < 90%, red ≥ 90%.

---

## Netbird

**What it shows:** Peer roster with online/offline/expired status, WireGuard IP address, operating system, last-seen time (for offline peers), SSH status, group membership, and the full list of access control policies.

**What is Netbird?** Netbird is an open-source WireGuard-based overlay network (similar to Tailscale). It creates a mesh VPN between your devices using WireGuard, with a management plane that handles peer discovery, key distribution, and access policies. It can be used fully self-hosted or with the Netbird cloud.

**Auth:** Personal Access Token (PAT) in the API key field. Generate one in **Netbird → Settings → Personal Access Tokens**. Stoa sends it as `Authorization: Token <PAT>`.

**URL:**
- **Netbird cloud:** `https://api.netbird.io`
- **Self-hosted:** `http://netbird-management:80` or your management server URL

**TLS:** Enable "Skip TLS verify" if using a self-hosted Netbird with a self-signed certificate.

**Polling:** Every 60 seconds.

**What the panel shows:**

- **Peers:** Full peer list with name, WireGuard IP, OS, and connection status. Online peers show a glowing green dot; offline peers show grey with time-since-last-seen; expired peers (login expired) show amber.
- **Status badges:** `EXPIRED` (amber) = peer's WireGuard key registration has lapsed; `SSH` (blue) = SSH is enabled on the peer.
- **Groups:** All peer groups with their member counts, sorted alphabetically.
- **Policies:** All access control policies with enabled/disabled status.
- **Summary chips:** Total peers, online count, offline count, expired count, group count, active/total policies.

---

## Firefly III

**What it shows:** Monthly financial summary (earned, spent, net worth, bills paid, bills unpaid, left to spend, net savings) and current balances for all active asset accounts.

**What is Firefly III?** Firefly III is an open-source personal finance manager. It tracks income, expenses, budgets, bills, and account balances. It supports multiple currencies and provides a detailed transaction ledger with tagging, categories, and recurring transactions.

**Auth:** Personal Access Token (PAT) in the API key field. Generate one in **Firefly III → Profile → OAuth → Personal Access Tokens** (click "Create new token"). Stoa sends it as `Authorization: Bearer <token>`.

**URL:** Your Firefly III base URL, e.g. `http://firefly:8080` or `https://firefly.example.com`. Do not include trailing slashes or paths.

**TLS:** Enable "Skip TLS verify" if Firefly III is behind a reverse proxy with a self-signed certificate.

**Polling:** Every 60 minutes — financial summary data changes infrequently.

**What the panel shows:**

- **Net worth:** Shown prominently at 4× height as a large number. Positive = green, negative = red.
- **Monthly summary:** Figures from Firefly's `/api/v1/summary/basic` endpoint for the current calendar month (first of month to today). Includes: earned, spent, bills paid, bills unpaid, left to spend, and net savings. Display order follows Firefly's built-in priority ranking.
- **Asset accounts:** All active asset accounts (checking, savings, cash) with their current balances. Inactive accounts are filtered out.
- **Color coding:** Green for positive values on income/net-worth items; red for negative. Spent and bills-unpaid are shown in red when non-zero (as expected for outflows).
- **Currency:** Values use the currency symbol and decimal format returned by Firefly's API. Multi-currency setups will show each currency separately in the summary.

**Note:** The summary endpoint returns separate entries per currency (e.g. `earned-in-EUR`, `earned-in-USD`). Stoa strips the currency suffix for display keys and groups by the clean key name (e.g. `earned`). If you use multiple currencies, you may see multiple rows for the same category.

---

## Scrutiny

**What it shows:** Fleet-wide hard drive health summary (passed/warning/failed counts, average and max temperature) and a per-drive breakdown showing model name, drive type (HDD/SSD/NVMe), storage capacity, temperature, power-on hours, reallocated sector count, and pending sector count.

**What is Scrutiny?** Scrutiny is a WebUI for hard drive SMART monitoring. It wraps `smartmontools`, polls drives on a schedule, stores historical SMART data, and applies configurable failure thresholds that are stricter than SMART's own defaults. It can alert you to drives that are deteriorating before SMART officially declares them failed.

**Auth:** None required — leave the API key field blank. Scrutiny has no built-in authentication. If you place it behind a reverse proxy with HTTP basic auth, Stoa does not currently support that; run it on an internal-only port instead.

**URL:** `http://scrutiny:8080` — the default port is 8080. Do not include trailing slashes or paths.

**TLS:** Enable "Skip TLS verify" if Scrutiny is behind a reverse proxy with a self-signed certificate.

**Polling:** Every 5 minutes.

**What the panel shows:**

- **Fleet health donut (4×):** A multi-segment ring showing the proportion of drives that passed, warned, or failed. Green = passed, amber = warning, red = failed. The center shows total drive count.
- **Status:** Scrutiny distinguishes two failure modes — "failed" means SMART's own threshold was exceeded (critical); "warning" means Scrutiny's stricter threshold was exceeded but SMART still reports the drive as healthy (investigate).
- **Temperature bar:** Mini horizontal bar per drive. Green < 40°C, amber 40–49°C, red ≥ 50°C. Bars are normalized to a 60°C maximum.
- **Reallocated sectors (attr 5):** Any non-zero count shows an amber badge. Even one reallocated sector on a spinning disk is a sign of surface damage — drives rarely recover from this.
- **Pending sectors (attr 197):** Sectors the drive is waiting to reallocate. Also shown as an amber badge if non-zero.
- **Power-on hours:** Formatted as years, months, or days. Useful context alongside manufacturer MTBF specs (typically 5–7 years for consumer drives, 7–10 for NAS/enterprise).
- **Drive type:** SSD (rotational speed = 0), NVMe (protocol = NVMe), or HDD (rotational speed > 0) detected automatically from SMART data.

**Sort order:** Failed drives appear first, then warning, then passed, then unknown — so the most urgent items are always at the top.

---

## Ghostfolio

**What it shows:** Current portfolio net worth, today's change (% and amount), 1-year return, all-time return (% and amount), total amount invested, and a full holdings breakdown — each position with name, value, allocation %, quantity, and individual return.

**What is Ghostfolio?** Ghostfolio is an open-source wealth management application for tracking stocks, ETFs, cryptocurrencies, and other assets. It connects to price data providers (Yahoo Finance, CoinGecko, etc.) to keep valuations current, and shows portfolio performance over time. Unlike tax tools, it's focused purely on portfolio performance visibility. It supports both a self-hosted Docker deployment and a paid cloud option at ghostfol.io.

**Auth:** Security token. In Ghostfolio, go to **User Account** (top-right avatar) → **Security Token** and copy the token. Paste it into the API key field in Stoa. Stoa exchanges this token for a short-lived JWT on each panel refresh by calling `POST /api/v1/auth/anonymous` — the JWT is used for all subsequent API calls and is not stored.

**URL:** Your Ghostfolio base URL, e.g. `http://ghostfolio:3333` or `https://app.ghostfol.io` (cloud). Do not include trailing slashes or paths.

**TLS:** Enable "Skip TLS verify" if Ghostfolio is behind a reverse proxy with a self-signed certificate.

**Polling:** Every 5 minutes.

**What the panel shows:**

- **Net worth:** Current total portfolio value in your Ghostfolio base currency (fetched from the `max` range performance endpoint, which always reflects current prices).
- **Today's change:** Net performance for the current day in both % and currency amount. Positive = green, negative = red.
- **1-year return:** Net performance percentage over the trailing 12 months.
- **All-time return:** Net performance since the first tracked transaction, in both % and total currency gain/loss.
- **Total invested:** The sum of all buy transactions (cost basis), shown for context alongside the all-time return.
- **Holdings donut (4× only):** Multi-segment ring showing each holding's share of total portfolio value. Top 9 are labeled individually; the remainder are grouped as "Other."
- **Holdings list:** All positions sorted by current value descending, each showing the asset name, quantity, market price, current value in base currency, and individual net performance %.

**Note on currency:** All values are shown in your Ghostfolio base currency (set in Ghostfolio → User Settings → Base Currency). If your base currency is EUR, values appear in EUR. The `Intl.NumberFormat` locale formatter is used for display — the currency symbol matches your base currency code.

---

## Coinbase

**What it shows:** Total portfolio value in USD, per-asset allocation donut with crypto brand colors, and a full account list showing each currency's balance (crypto quantity and USD equivalent) with proportional allocation bars.

**What is Coinbase?** Coinbase is the largest US-based cryptocurrency exchange. It holds assets in named wallets (Bitcoin Wallet, Ethereum Wallet, etc.) plus any USD or stablecoin cash balances. The Stoa integration uses Coinbase's v2 REST API with a read-only API key — it can only read balance data and cannot initiate any transactions.

**Auth:** API key + secret in `apiKey:apiSecret` format (colon-separated). Create a read-only key in **Coinbase → Settings → API → New API Key**. Under permissions, select only "View" — do not grant trade or transfer permissions. Paste the key and secret into the API key field separated by a colon: `yourApiKey:yourApiSecret`.

**Security:** A read-only Coinbase API key cannot initiate transfers, trades, or withdrawals. The worst-case exposure from a compromised key is a read of your balance data, not loss of funds.

**URL:** Leave as `https://api.coinbase.com` (the default). Coinbase's API is always HTTPS — no self-hosted option exists.

**Polling:** Every 5 minutes.

**What the panel shows:**

- **Total value:** Sum of all non-zero account native balances in USD.
- **Allocation donut (4× only):** Multi-segment ring using each cryptocurrency's official brand color (BTC orange, ETH blue, SOL purple, USDC blue-grey, etc.). Top 9 assets shown individually; remainder grouped as "Other."
- **Account list:** All Coinbase wallets with a non-zero balance, sorted by USD value descending. Each row shows the currency code, crypto quantity (for non-fiat assets), and USD value. The 4× layout adds a proportional allocation bar per row.
- **Stacked bar (2–3×):** A thin horizontal bar showing the relative allocation of all assets using their brand colors, with a legend below.

**Fiat accounts:** USD, USDC, USDT, DAI, and other stablecoin/fiat accounts are treated the same as crypto — their native balance is already in USD so no conversion is needed.

**Pagination:** Coinbase paginates accounts in pages of up to 100. Stoa fetches all pages automatically so all wallets appear regardless of how many accounts you have.

---

## NZBGet

**What it shows:** Current download speed, queue status, per-download progress bars with category badges and size remaining, today's total downloaded, free disk space, and a recent history list.

**What is NZBGet?** NZBGet is a lightweight, efficient Usenet downloader that uses the JSON-RPC protocol for its API. It processes NZB files for automatic downloading, repair, and extraction.

**Auth:** Username and password in `username:password` format in the API key field. Use your NZBGet control username and password from **NZBGet → Settings → Security → ControlUsername / ControlPassword**.

**URL:** Your NZBGet base URL, e.g. `http://nzbget:6789` (default port is 6789).

**Polling:** Every 15 seconds.

**What the panel shows:**

- **Download speed:** Current throughput formatted as KB/s or MB/s (from the JSON-RPC `status` method).
- **Status chip:** Green for downloading, amber for paused, gray for idle.
- **Queue count + remaining:** Number of items queued and total MB/GB left.
- **Today's downloaded:** Total MB/GB downloaded in the current session.
- **Free disk:** Available disk space on the destination drive.
- **Queue slots:** Per-download progress bars with NZB name, category badge, completion percentage, and MB remaining.
- **History:** 10 most recent completions — SUCCESS (✓), FAILURE (✗), DELETED (✗) — with file sizes.

---

## SABnzbd

**What it shows:** Current download speed, queue status (Downloading/Paused/Idle), per-slot progress bars with percentage and time remaining, and a recent completion history list.

**What is SABnzbd?** SABnzbd is a popular open-source Usenet binary newsreader and downloader. It downloads NZB files automatically, handles multi-part posts, repairs with PAR2, and unpacks archives. It is commonly used alongside Sonarr/Radarr via the SABnzbd download client integration.

**Auth:** Bare API key in the API key field. Find it in **SABnzbd → Config → General → API Key**. Stoa passes it as a `?apikey=` query parameter — no header is used.

**URL:** Your SABnzbd base URL, e.g. `http://sabnzbd:8080` or `http://192.168.1.x:8080`. No trailing slash needed.

**Polling:** Every 15 seconds (queue data changes rapidly during active downloads).

**What the panel shows:**

- **Download speed:** Current throughput displayed prominently, formatted as KB/s or MB/s.
- **Status chip:** Color-coded indicator — green for Downloading, amber for Paused, gray for Idle.
- **Queued count:** Number of items in the current queue.
- **Remaining:** Total MB/GB left across all queued items, plus estimated time to completion.
- **Queue slots:** Per-download progress bars showing filename, category badge (tv, movies, music, etc.), completion percentage, MB remaining, and individual time left.
- **History:** Recent completed (✓), failed (✗), and incomplete (↻) downloads with file size.

---

## Actual Budget

**What it shows:** Monthly income, total spending, and available balance for the current month; spending vs. budgeted progress bars per category group; full per-category breakdown; account balances for all open accounts (on-budget and off-budget); and a net worth total.

**What is Actual Budget?** Actual Budget is an open-source envelope budgeting app (similar to YNAB). It is local-first — your data lives on your machine in an encrypted SQLite file. It has a sync server (`actual-server`) for multi-device access and a companion web UI. Because there is no native HTTP API for querying budget data, Stoa connects via `actual-http-api`, a community-maintained REST wrapper.

**Sidecar requirement:** Stoa does **not** connect directly to `actual-server`. You must also run `actual-http-api` as a separate container. It acts as a REST bridge between Stoa and your Actual data. See setup below.

**Auth:** An API key that you configure on `actual-http-api`. Stoa sends it as the `x-api-key` request header.

**URL:** The URL of your `actual-http-api` instance, e.g. `http://actual-http-api:5007`. Do **not** point this at your `actual-server` directly.

**TLS:** Enable "Skip TLS verify" if `actual-http-api` is behind a reverse proxy with a self-signed certificate.

**Polling:** Every 5 minutes.

**Setup — running actual-http-api:**

Add the `actual-http-api` container to your Docker Compose stack:

```yaml
actual-http-api:
  image: jhonderson/actual-http-api:latest
  environment:
    API_KEY: "your-chosen-api-key"               # set this — use in Stoa's API key field
    ACTUAL_SERVER_URL: "http://actual-server:5006"
    ACTUAL_SERVER_PASSWORD: "your-actual-password"
  ports:
    - "5007:5007"
```

- `API_KEY` — choose any secret string; this is what you paste into Stoa's API key field
- `ACTUAL_SERVER_URL` — the URL of your existing `actual-server` container
- `ACTUAL_SERVER_PASSWORD` — your Actual login password (the one you use at the web UI)

Once running, confirm it's working by visiting `http://your-host:5007/api-docs/` — the Swagger UI should load.

**Budget sync ID:** If you have a single budget, Stoa auto-discovers it — no extra config needed. If you have multiple budgets, find your budget's sync ID by calling `http://actual-http-api:5007/v1/budgets` and add `budgetId` to the panel config JSON.

**End-to-end encryption:** If your Actual budget has end-to-end encryption enabled, actual-http-api requires the budget encryption password as a query parameter on each request. This is not currently supported by Stoa — configure your budget without E2EE, or set `ACTUAL_BUDGET_ENCRYPTION_PASSWORD` as an environment variable directly on the `actual-http-api` container if the project supports it.

**What the panel shows:**

- **Net worth:** Sum of all open account balances.
- **Monthly summary:** Income received, total spending, and available balance for the current calendar month. Income is positive/green; spending is shown as an absolute value in red.
- **Category group bars:** Each non-hidden category group shown as a spending progress bar (spent / budgeted). Green = < 85%, amber = 85–100%, red = over budget.
- **Category detail (4× only):** Full per-category breakdown within each group, with individual spent/budgeted figures and mini progress bars.
- **Accounts:** On-budget accounts (checking, savings, cash, credit) and off-budget accounts (investments, mortgages) listed separately with current balances.

**Amounts:** Actual stores amounts as integers in cents. Stoa divides by 100 and formats with `$` prefix. If you use a non-USD currency, the numbers are correct but the `$` symbol is a display artifact.

---

## Paperless-ngx

**What it shows:** Total document count, inbox count, document type breakdown as a donut chart, tag usage as proportional bars in each tag's own color, correspondent ranking with bars, and the 10 most recently added documents with direct links into the Paperless web UI.

**What is Paperless-ngx?** Paperless-ngx is an open-source document management system. It scans, OCRs, and organizes physical and digital documents. Documents are tagged, assigned a correspondent (who sent them), a document type (invoice, statement, contract, etc.), and a creation date. It replaces folders full of scanned PDFs with a searchable, tagged archive.

**Auth:** API token. In Paperless-ngx, go to **Settings → API** and click "Generate Token". Paste the token into the API key field in Stoa. Stoa sends it as `Authorization: Token <token>` (note: "Token", not "Bearer").

**URL:** Your Paperless-ngx base URL, e.g. `http://paperless:8000` or `https://paperless.example.com`. Do not include trailing slashes or paths.

**UI URL:** Optional. If your Paperless-ngx API URL and web UI URL differ (e.g. API is internal, UI is external), set the UI URL separately in the integration settings. Recent document links in the panel use the UI URL. If not set, falls back to the API URL.

**TLS:** Enable "Skip TLS verify" if Paperless-ngx is behind a reverse proxy with a self-signed certificate.

**Polling:** Every 5 minutes.

**What the panel shows:**

- **Total documents:** Total document count from the Paperless archive.
- **Inbox count:** Documents waiting to be processed. If you have configured an inbox tag in Paperless (`is_inbox_tag = true`), its document count is used. If not, Stoa falls back to the count of completely untagged documents. Either way, a non-zero inbox count shows in amber as an action item.
- **Document type donut (4× only):** Multi-segment ring showing the proportional split across document types (invoices, statements, receipts, etc.). Each segment uses a distinct color; the legend lists type name and document count.
- **Tag bars:** Each tag is shown as a horizontal proportional bar in its own Paperless color. The bar width represents the tag's document count relative to the most-used tag. The inbox tag (if any) is excluded — it appears in the inbox counter instead. Sorted by document count descending; top 8 shown.
- **Correspondent bars:** Top 6 correspondents sorted by document count, each with a proportional bar. Useful for seeing at a glance who your heaviest senders are.
- **Recent documents:** The 10 most recently added documents, each with title, creation date, correspondent, and document type. Each row links directly to that document in the Paperless web UI.

**Tag colors:** Tags in Paperless have user-assigned colors. Stoa uses these colors directly for the tag swatches and bars. Tags with no color or a pure-black color (`#000000`) fall back to indigo.

**Pagination:** Stoa fetches up to 100 tags, correspondents, and document types per panel refresh. If you have more than 100 of any of these, the excess won't appear. This limit is sufficient for all realistic Paperless installations.

---

## Mealie

**What it shows:** Total recipe count, this week's meal plan displayed day-by-day with meal type icons, the first active shopping list with checked/unchecked items, and the 8 most recently added recipes with ratings and cook times.

**What is Mealie?** Mealie is a self-hosted recipe manager and meal planner. It stores recipes (with instructions, ingredients, nutrition, images, and cook times), lets you plan meals week-by-week, and generates shopping lists from your meal plan. It has OCR-based recipe import from URLs and images, plus HACS integration for Home Assistant.

**Auth:** Long-lived API token. In Mealie, go to **User Settings → API Tokens** and click "Create Token". Paste the token into the API key field in Stoa. Stoa sends it as `Authorization: Bearer <token>`.

**URL:** Your Mealie base URL, e.g. `http://mealie:9000` or `https://mealie.example.com`. Default port is 9000 for Docker deployments. Do not include trailing slashes or paths.

**TLS:** Enable "Skip TLS verify" if Mealie is behind a reverse proxy with a self-signed certificate.

**Polling:** Every 15 minutes — recipes and meal plans change infrequently.

**What the panel shows:**

- **Total recipes:** Pulled from the recipes endpoint with `perPage=1` to get just the total count.
- **This week's meal plan:** Monday through Sunday of the current calendar week. Each day lists its meals in order (breakfast → lunch → dinner → sides). Today's date is highlighted in indigo with a "Today" badge. Recipe names link directly to the recipe detail page in Mealie. Custom meal titles (not linked to a recipe) are shown as plain text.
- **Shopping list:** The first active shopping list. Unchecked items appear prominently; checked items appear dimmed at the bottom (max 3 shown). Each item shows the food name and quantity/unit from Mealie's structured ingredient data.
- **Recent recipes:** The 8 most recently added recipes sorted by `dateAdded` descending. Each shows the recipe name, star rating (1–5), and total cook time. Each links to the recipe in Mealie.

**Meal types:** Mealie supports four entry types: `breakfast`, `lunch`, `dinner`, and `side`. Stoa displays them in that order within each day using icons (🌅 breakfast, ☀️ lunch, 🌙 dinner, 🍽️ other).

**Shopping lists:** Stoa fetches all shopping lists and displays the first one. If you have multiple lists, only the first is shown. You cannot currently select which list appears in the panel — items from other lists are not shown.

---

## Grocy

**What it shows:** Food expiry tracking with urgency color coding (expired/expiring soon), overdue chores, pending tasks with due dates, and the shopping list.

**What is Grocy?** Grocy is a self-hosted grocery and household management system. It tracks what you have in stock, when food expires, recurring household chores, tasks, and shopping lists. It's especially popular for reducing food waste — you can see at a glance what needs to be eaten soon or has already expired.

**Auth:** API key. In Grocy, go to **Manage API Keys** (linked from the top-right menu) or navigate to **Settings → User Management → Your User → API Keys**. Generate a key and paste it into the API key field in Stoa. Stoa sends it as the `GROCY-API-KEY` request header on every call.

**URL:** Your Grocy base URL, e.g. `http://grocy:80` or `https://grocy.example.com`. Default port is 80 for Docker deployments. Do not include trailing slashes or paths.

**TLS:** Enable "Skip TLS verify" if Grocy is behind a reverse proxy with a self-signed certificate.

**Polling:** Every 5 minutes — stock expiry dates and task completion states change frequently.

**What the panel shows:**

- **Food expiry:** Products from Grocy's volatile stock endpoint — items that are due, overdue, or expired. Expired items (past the best-before date) show in red with "Xd ago"; items expiring within 2 days show in orange; items within 5 days show in amber; items within a week show in yellow. Sorted expired-first, then by closest expiry date.
- **Chores:** All chores from Grocy, sorted overdue-first. Overdue chores (past their next estimated execution time) are highlighted in amber with a "Xd overdue" label. Non-overdue chores are dimmed and show their next scheduled execution.
- **Tasks:** Pending (incomplete) tasks sorted overdue-first, then by due date. Overdue tasks show in red. Tasks without a due date appear at the bottom.
- **Shopping list:** Undone items from the shopping list. Product names are resolved from Grocy's product catalog. Items linked to a product show the product name; items with only a note (custom entries) show the note text.

**Product name resolution:** Grocy's shopping list and stock entries use product IDs, not names. Stoa fetches the full product catalog first and builds a lookup table — product names are resolved from this table. If a product is deleted from Grocy but still appears on the shopping list, its ID will be shown instead of a name.

---

## LubeLogger

**What it shows:** Per-vehicle urgency-colored reminder list (past due/urgent/not urgent), last known odometer reading, and a service history log with dates, descriptions, and costs. Works both as a standalone dashboard panel and as a **calendar source** for date-bound reminders.

**What is LubeLogger?** LubeLogger is a self-hosted, open-source vehicle maintenance and fuel log tracker. It tracks oil changes, tire rotations, repairs, and any other service you perform on your vehicles. It supports multiple vehicles, recurring reminders (by date and/or mileage), and generates urgency levels based on how overdue something is.

**Auth:** Stoa supports two auth methods:
- **API key** (recommended): Generate a key in LubeLogger → Profile → API Keys. Paste the bare key into the API key field. Stoa sends it as the `x-api-key` request header.
- **Basic Auth**: Enter `username:password` in the API key field. Stoa detects the colon and sends Basic Auth credentials.

**URL:** Your LubeLogger base URL, e.g. `http://lubelogger:8080` or `https://lubelogger.example.com`. No trailing slash or paths.

**Polling:** Every 15 minutes.

**What the panel shows:**

- **Fleet summary:** Vehicle count, overdue reminder count (red), urgent reminder count (amber), or "All good ✓" if nothing is urgent.
- **Per-vehicle section:** Year/Make/Model + last known odometer. Each reminder is shown as a row with a colored left border matching its urgency: red (Past Due), orange (Very Urgent), amber (Urgent), indigo (Not Urgent). For date-bound reminders, the "Xd overdue" or "in Xd" label is computed from today. For mileage-only reminders, the target mileage is shown.
- **Service history (4× only):** The most recent service records across all vehicles, sorted newest-first. Each shows date, odometer, description, and cost (if recorded). When multiple vehicles are configured, the vehicle name appears on each entry.

**Urgency levels:** LubeLogger computes urgency automatically — "Past Due" means the threshold has been passed, "Very Urgent" and "Urgent" indicate it's approaching, and "Not Urgent" means there's plenty of time.

**Calendar source:** When added as a calendar source, LubeLogger emits one event per date-bound reminder (reminders with a due date, not mileage-only). The event title is "Year Make Model — Reminder Name" and the color matches urgency. Mileage-only reminders are not emitted since they have no calendar date. Past-due reminder events appear on their original due date.

---

## Tandoor

**What it shows:** Total recipe count, this week's meal plan displayed as a day-by-day calendar, an unchecked shopping list, and the 8 most recently added recipes with star ratings, cook time, and keyword tags.

**What is Tandoor?** Tandoor is a self-hosted recipe manager with a full REST API. It supports recipe import from URLs, nutritional information, meal planning (per meal type per day), and shared shopping lists. It is commonly deployed via Docker.

**Auth:** API token. In Tandoor, open the **User Menu → API Token** (or `/accounts/token/`). Copy the token and paste it into the API key field in Stoa. Stoa sends it as `Authorization: Bearer <token>`.

**URL:** Your Tandoor base URL, e.g. `http://tandoor:8080` or `https://recipes.example.com`. The default Docker port is 8080. Do not include trailing slashes or `/api` paths.

**TLS:** Enable "Skip TLS verify" if Tandoor is behind a reverse proxy with a self-signed certificate.

**Polling:** Every 15 minutes — recipes and meal plans change infrequently.

**What the panel shows:**

- **Recipe count:** Total recipes in your Tandoor instance (from the paginated recipe endpoint's `count` field).
- **This week's meals (Mon–Sun):** All meal plan entries for the current ISO calendar week. Each day shows its entries in order (breakfast → lunch → dinner → snack), with the entry's title or linked recipe name. Today's row is highlighted in indigo.
- **Shopping list:** Up to 12 unchecked items from `/api/shopping-list-entry/`. Each item shows the food name, quantity, and unit.
- **Recent recipes:** The 8 most recently added recipes. Each row shows the recipe name (linked to the recipe page), star rating (★ out of 5), cook time in minutes, and up to 4 keyword tags as colored pills.

**Meal types:** Tandoor meal types are user-defined. Stoa sorts them by name within each day using a built-in order for common names (breakfast < lunch < dinner < snack); custom meal type names fall at the end.

---

## Bazarr

**What it shows:** Missing subtitle counts for TV episodes and movies separately, the health status of each configured subtitle provider (Good vs throttled/failing), monthly download stats broken down by TV and movies, Sonarr/Radarr live connection status, and the Bazarr version.

**What is Bazarr?** Bazarr is a subtitle management companion application for Sonarr and Radarr. It monitors your TV and movie libraries for missing subtitles and automatically searches for and downloads them from configured subtitle providers (OpenSubtitles, Subscene, Addic7ed, Podnapisi, and many others). It replaces the manual process of hunting for subtitles and keeps them in sync as new content is added.

**Auth:** Plain API key. In Bazarr, go to **Settings → General → Security** and copy the API Key. Paste it into the API key field in Stoa.

**URL:** Your Bazarr base URL, e.g. `http://192.168.1.10:6767`. Do not include trailing slashes.

**TLS:** Enable "Skip TLS verify" if Bazarr is behind a reverse proxy with a self-signed certificate.

**Polling:** Every 60 seconds.

**What the panel shows:**

- **Missing subtitles:** Pulled from `/api/badges`. TV episodes (amber) and movies (cyan) are shown separately. The donut shows the split. Zero missing = green checkmark.
- **Provider health:** Each configured subtitle provider with its status from `/api/providers`. "Good" = healthy (green); any other status (throttled, in backoff) = issue (red). The retry timestamp is shown for providers in backoff.
- **Monthly downloads:** Subtitle download counts for the last 30 days from `/api/history/stats?timeframe=month`, split by TV and movies. Shown as a mini bar chart in the 4× layout.
- **Sonarr/Radarr live:** Whether Bazarr's real-time connection to Sonarr and Radarr is active ("LIVE"). An offline connection means Bazarr may not receive notifications about new content.
- **Health issues:** Count of system-level health issues reported by Bazarr (e.g. bad configuration, unreachable indexers).

**Subtitle providers:** Bazarr supports a large number of subtitle providers. Some require accounts or API keys configured within Bazarr itself — Stoa only shows whether those providers are currently healthy, not their credentials.

---

## autobrr

**What it shows:** Cumulative grab statistics (total seen, grabbed, filtered, rejected, push errors), IRC network connection status (connected/disconnected per network with channel count and uptime), active filter count, and a live activity feed of recent releases showing what was grabbed, what was filtered out, and the rejection reason for anything that didn't make it through.

**What is autobrr?** autobrr is a modern torrent autodl replacement. It monitors IRC announce channels and RSS feeds from private torrent trackers, applies your filter rules (by release name, category, size, freeleech percentage, etc.), and automatically pushes matching torrents to download clients (qBittorrent, Deluge, Transmission, rTorrent) or directly to Sonarr, Radarr, Lidarr, or Readarr. It replaces the older autodl-irssi plugin with a web UI and a proper REST API.

**Auth:** Plain API key. In autobrr, go to **Settings → API** and copy the API key. Paste it into the API key field in Stoa.

**URL:** Your autobrr base URL, e.g. `http://192.168.1.10:7474`. Do not include trailing slashes.

**TLS:** Enable "Skip TLS verify" if autobrr is behind a reverse proxy with a self-signed certificate.

**Polling:** Every 30 seconds.

**What the panel shows:**

- **Grab statistics:** Pulled from `GET /api/releases/stats`. Four counters: total seen (all announces evaluated), grabbed (push approved), rejected (filter rejected + push rejected), and push errors (grab attempted but the download client or \*arr instance rejected or errored).
- **IRC network status:** Each configured IRC network with its connection state (green = connected, red = disconnected), number of monitored announce channels, and time since last connection. Disconnected networks mean autobrr is blind to new announces on that tracker — this is the most operationally critical signal.
- **Active filter count:** Number of enabled filters in your autobrr configuration.
- **Recent activity feed:** Last 50 releases autobrr evaluated. Each entry shows the release name, indexer, filter that matched (or rejected), the action taken (which download client or \*arr received it), and the rejection reason for filtered/rejected entries.

**Release statuses:**

| Status | Color | Meaning |
|---|---|---|
| GRABBED | Green | Filter matched and successfully pushed to a download client or \*arr |
| FILTERED | Grey | Did not match any filter — not an error, just not wanted |
| REJECTED | Amber | Filter matched but the download client or \*arr rejected it (duplicate, wrong quality, etc.) |
| ERROR | Red | Filter matched and push was attempted, but the downstream client returned an error |

**IRC network health:** If an IRC network shows as disconnected, autobrr will not receive new announces from trackers on that network until the connection is restored. This can be caused by an IRC server restart, a nick collision, or a network issue. autobrr attempts to reconnect automatically.

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

## Tdarr

**What it shows:** Media transcoding automation status — active and idle worker counts, per-worker detail (node name, worker type, current file, progress %, ETA), total library file count, files transcoded, files health-checked, and cumulative space saved in GB.

**Auth:** Optional. Leave blank for unauthenticated local instances. For API key auth: bare token from Tdarr → Tools → API Keys. For a Basic Auth reverse-proxy layer: `username:password`.

**URL:** Your Tdarr server URL, e.g. `http://192.168.1.10:8265`

**Height:** 1× = compact bar (active workers, space saved, file counts); 2–3× = worker list with progress and ETA; 4×+ = full worker detail + library stats.

---

## Maintainerr

**What it shows:** Media library cleanup collection overview — active collection count, total media in collections, items handled to date. Collection list with type (movies, shows, seasons, episodes), delete-after window, arr action (delete / unmonitor+delete / unmonitor), and current media count per collection.

**Auth:** Optional. Maintainerr runs unauthenticated by default — leave blank. For a reverse-proxy Basic Auth layer: `username:password`. For Bearer: bare token.

**URL:** Your Maintainerr base URL, e.g. `http://192.168.1.10:6246`

**Height:** 1× = active collections count + total media; 2–3× = stat chips + collection list; 4×+ = full collection table with delete window and action detail.

---

## Docspell

**What it shows:** Document archive stats — total item count, storage usage, tag count — and a scrollable list of recently added documents with name, date, correspondent, folder, and tags.

**Auth:** `account:password`. For multi-collective Docspell instances, use `collective/user:password`. For a single-collective instance, just `user:password`. Stoa exchanges credentials for a session token.

**URL:** Your Docspell base URL, e.g. `http://192.168.1.10:7880`

**Height:** 1× = stat chips (items, storage, tags); 2–3× = chips + recent document list; 4×+ = two-column layout (stats + tags | full recent document list with correspondent and folder).

---

## RomM

**What it shows:** ROM library overview — total platform count, total ROM count, library size. Per-platform list with ROM counts and platform logos. Recently added games with cover art.

**Auth:** Two options:
- `username:password` — standard RomM credentials (Basic Auth)
- Bare `rmm_` bearer token — from RomM → Settings → API Keys

**URL:** Your RomM base URL, e.g. `http://192.168.1.10:8080`

**Height:** 1× = total ROMs + platforms + library size; 2–3× = stat chips + platform list with counts + cover grid; 4×+ = platform detail + full cover grid.

---

## Pterodactyl

**What it shows:** Game server panel — list of all servers accessible to your API key with state (running/starting/stopping/offline), CPU usage percentage, memory usage and limit, disk usage and limit, and uptime. Running/total server summary counts.

**Auth:** Client API key (`ptlc_…`) from Pterodactyl → Account → API Credentials. Sent as `Authorization: Bearer`. Note: this is the *client* API key, not the application API key — it shows servers your account can access.

**URL:** Your Pterodactyl panel base URL, e.g. `http://192.168.1.10`

**Height:** 1× = running/total server count; 2–3× = compact server list with state and CPU/RAM; 4×+ = full server cards with CPU, RAM, disk usage bars, and uptime.

---

## Monica

**What it shows:** Total contact count and upcoming reminders — title, contact name, next expected date, and days until. Reminders due today or within 7 days are color-highlighted.

**Auth:** Bearer token. Generate one in Monica → Settings → API → Create New Token.

**URL:** Your Monica base URL, e.g. `http://192.168.1.10:8080`

**Height:** 1× = contact count + imminent reminder count; 2–3× = stat chip + reminder list; 4×+ = reminder list with full detail.

---

## Homebox

**What it shows:** Home inventory summary — total item count, location count, label count, items with active warranties, and total inventory value (when purchase prices are set). Per-location item counts with proportional bars.

**Auth:** `email:password` of your Homebox account. Stoa logs in via the Homebox API and uses the returned session token.

**URL:** Your Homebox base URL, e.g. `http://192.168.1.10:7745`

**Height:** 1× = total items + locations + warranty count; 2–3× = stat chips + location list; 4×+ = stat chips + location bars + inventory value breakdown.

---

## wger

**What it shows:** Workout manager panel — total workout count, recent workout sessions (date, impression rating, notes), and weight tracking history (recent weight log entries with date and value).

**Auth:** Permanent API key from wger → Dashboard → API (top-right menu) or Profile → API Key. Stoa sends it as `Authorization: Token <key>`.

**URL:** Your wger base URL, e.g. `http://192.168.1.10:80`

**Height:** 1× = total workouts + most recent session date; 2–3× = stat chips + recent session list; 4×+ = session list + weight log chart.

---

## Fittrackee

**What it shows:** Activity tracker panel — total workout count, number of sports, total distance, total duration, total ascent, and a recent workout list (sport type with emoji, title, date, distance, duration, average speed, ascent).

**Auth:** `email:password` of your Fittrackee account. Stoa logs in via the Fittrackee API and uses the returned JWT token.

**URL:** Your Fittrackee base URL, e.g. `http://192.168.1.10:5000`

**Height:** 1× = total workouts + distance + duration; 2–3× = stat chips + recent workout list; 4×+ = stat chips + full workout list with all metrics.

---

## Spotify

**What it shows:** Currently playing track (or most recently played), album art, track name, artist, album, playback progress bar with live tick, and recent play history. Playback controls (play/pause, previous, next) are available for Spotify Premium accounts.

**Auth:** OAuth. Setup is a two-step process:

1. Create a Spotify app at [developer.spotify.com](https://developer.spotify.com) → Dashboard → Create App. Set the Redirect URI to `https://your-stoa-url/api/spotify/callback`. Store `clientId:clientSecret` (colon-separated) in the API key field.
2. After saving the integration, open it again in edit mode and click **Connect Spotify Account** to authorize. Stoa redirects you through Spotify's OAuth flow and stores the access and refresh tokens.

**URL:** Not required — leave empty. Stoa sets this automatically.

**Playback controls:** Proxied through the Stoa backend — your access token never leaves the server. Requires Spotify Premium for `play`, `pause`, `next`, and `previous` to work. Controls are shown at 2× and above; clicking them sends the command instantly and refreshes the panel after 800ms.

**Token refresh:** Access tokens expire every hour. Stoa automatically refreshes using the stored refresh token — no re-authorization needed.

**Height:** 1× = now-playing indicator + track + artist; 2–3× = album art + track info + progress bar + controls; 4×+ = all of the above + recent play history.

---

## Last.fm

**What it shows:** Music scrobbling panel — now playing indicator (animated red pulsing dot), currently or recently scrobbled track with artist and album, total lifetime scrobble count, and member since year. Top artists for the past 7 days as a proportional bar chart. Top tracks and top albums for the past 7 days. Recent scrobble history at tall heights.

**Auth:** `username:apiKey` (colon-separated). Get a free API key at [last.fm/api](https://www.last.fm/api). No OAuth or account linking required — just your Last.fm username and the API key.

**URL:** Not required — data is fetched directly from the Last.fm public API.

**Real-time:** Last.fm's API does not support streaming. Stoa polls every 30 seconds to keep the now-playing state current.

**Height:** 1× = now-playing dot (if active) + track + artist + scrobble count; 2–3× = now-playing section + full recent scrobble list; 4×+ = album art + track/artist/album info + top artists bar chart + top tracks and albums side-by-side; 5×+ also shows recent scrobble history.

---

## Strava

**What it shows:** Running, cycling, and multi-sport activity feed with distance, pace/speed, elevation, and relative timestamps. 4-week sport summaries (run/ride/swim totals). 8-week stacked bar chart of weekly distance. Year-to-date stats at larger panel sizes. Uses the athlete's measurement preference (miles or kilometers) automatically.

**Auth:** OAuth 2.0 Authorization Code flow. Setup is a two-step process:

1. Create a Strava API application at [strava.com/settings/api](https://www.strava.com/settings/api). Set the Authorization Callback Domain to your Stoa hostname. Store `clientId:clientSecret` (colon-separated) in the API key field.
2. After saving the integration, open it again in edit mode and click **Connect Strava** to authorize. Stoa redirects you through Strava's OAuth flow and stores the access and refresh tokens.

**URL:** Not required — leave empty. Stoa sets this automatically.

**Scopes requested:** `read,activity:read,activity:read_all` — for public and private activities and stats.

**Token refresh:** Strava access tokens expire every 6 hours. Stoa automatically refreshes using the stored refresh token — no re-authorization needed.

**Height:** 1× = last activity emoji + name + distance + time; 2–3× = avatar + location + 4-week sport summaries + recent activity list; 4×+ = YTD stat chips + 4-week summaries + 8-week stacked bar chart + full activity list.

---

## Duolingo

**What it shows:** Daily streak, today's XP vs. daily goal with progress bar, total XP, league tier, active language, all learning courses with level and XP bars, and a 14-day XP bar chart at larger sizes.

**Auth:** `username:password` — your Duolingo login credentials. Stoa uses Duolingo's unofficial API (read-only). Credentials are stored encrypted and used only to obtain a session JWT. The JWT is cached in memory for 12 hours to avoid repeated logins on every 60-second refresh.

**URL:** Not required — leave empty. Stoa always calls `www.duolingo.com`.

**Unofficial API:** Duolingo does not publish an official API. Stoa uses the same endpoints as the Duolingo mobile app. These endpoints work as of mid-2026 but may change without notice if Duolingo alters their app's protocol.

**Height:** 1× = streak + active language + today's XP/goal; 2–3× = streak + goal progress bar + league badge + course XP bars; 4×+ = streak + goal bar + 14-day XP chart + full course list.

---

## Notes on TLS

Most home network services use self-signed certificates. Stoa will detect TLS certificate errors and report them — enable **"Skip TLS verify"** on the integration to bypass certificate validation. This is safe on a trusted home network.

Stoa also handles TLS renegotiation automatically (relevant for TrueNAS, which renegotiates every 60 seconds).
