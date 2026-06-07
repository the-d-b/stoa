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

## Notes on TLS

Most home network services use self-signed certificates. Stoa will detect TLS certificate errors and report them — enable **"Skip TLS verify"** on the integration to bypass certificate validation. This is safe on a trusted home network.

Stoa also handles TLS renegotiation automatically (relevant for TrueNAS, which renegotiates every 60 seconds).
