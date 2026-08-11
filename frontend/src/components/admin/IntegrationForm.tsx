/**
 * IntegrationForm — unified create + edit form for integrations.
 * Used by system settings (scope='system') and personal profile (scope='personal').
 *
 * Create mode: integration prop is undefined.
 * Edit mode:   integration prop provided, type is locked.
 */
import { useState, useEffect } from 'react'
import { integrationsApi, myIntegrationsApi, secretsApi, weatherApi, steamApi, Integration } from '../../api'
import SportsConfigUI from './SportsConfigUI'
import StocksConfigUI from './StocksConfigUI'
import CryptoConfigUI from './CryptoConfigUI'
import TypeCardPicker from './TypeCardPicker'
import CatalogBrowser from './CatalogBrowser'

export const INTEGRATION_TYPES = [
  // Media Servers
  { id: 'plex',         label: 'Plex',         desc: 'Media server',                                                category: 'Media Servers' },
  { id: 'jellyfin',     label: 'Jellyfin',     desc: 'Media server',                                                category: 'Media Servers' },
  { id: 'emby',         label: 'Emby',         desc: 'Media server',                                                category: 'Media Servers' },
  { id: 'tautulli',     label: 'Tautulli',     desc: 'Plex analytics',                                              category: 'Media Servers' },
  { id: 'jellystat',    label: 'Jellystat',    desc: 'Jellyfin statistics & watch history',                          category: 'Media Servers' },
  { id: 'tracearr',     label: 'Tracearr',     desc: 'Cross-platform analytics & account-sharing detection (Plex/Jellyfin/Emby)', category: 'Media Servers' },
  { id: 'immich',       label: 'Immich',       desc: 'Self-hosted photo & video management',                         category: 'Media Servers' },
  { id: 'photoprism',   label: 'PhotoPrism',   desc: 'Photo management',                                            category: 'Media Servers' },
  // Media Management
  { id: 'sonarr',       label: 'Sonarr',       desc: 'TV show management',                                          category: 'Media Management' },
  { id: 'radarr',       label: 'Radarr',       desc: 'Movie management',                                            category: 'Media Management' },
  { id: 'lidarr',       label: 'Lidarr',       desc: 'Music management',                                            category: 'Media Management' },
  { id: 'readarr',      label: 'Readarr',      desc: 'Book & audiobook management',                                 category: 'Media Management' },
  { id: 'bazarr',      label: 'Bazarr',      desc: 'Subtitle manager — URL is http://bazarr:6767. API key found in Bazarr → Settings → General → Security → API Key.', category: 'Media Management' },
  { id: 'prowlarr',    label: 'Prowlarr',    desc: 'Indexer manager — URL is http://prowlarr:9696. API key found in Prowlarr → Settings → General → API Key.', category: 'Media Management' },
  { id: 'autobrr',     label: 'autobrr',     desc: 'Torrent autodl — URL is http://autobrr:7474. API key found in autobrr → Settings → API.', category: 'Media Management' },
  { id: 'overseerr',    label: 'Overseerr / Jellyseerr', desc: 'Media request management',                          category: 'Media Management' },
  { id: 'tdarr',        label: 'Tdarr',        desc: 'Media transcoding automation — URL is http://tdarr:8265. API key: token from Tdarr → Tools → API Keys (leave blank for unauthenticated local instances). Use username:password for Basic Auth via a reverse proxy.', category: 'Media Management' },
  { id: 'maintainerr', label: 'Maintainerr',  desc: 'Media library cleanup — URL is http://maintainerr:6246. Runs unauthenticated by default; leave API key blank. For reverse-proxy Basic Auth use username:password; for Bearer use a bare token.', category: 'Media Management' },
  // Downloads
  { id: 'transmission', label: 'Transmission', desc: 'BitTorrent client',                                           category: 'Downloads' },
  { id: 'qbittorrent', label: 'qBittorrent',  desc: 'BitTorrent client',                                           category: 'Downloads' },
  { id: 'deluge',      label: 'Deluge',       desc: 'BitTorrent client',                                           category: 'Downloads' },
  { id: 'rutorrent',   label: 'ruTorrent',    desc: 'rTorrent/ruTorrent BitTorrent client',                        category: 'Downloads' },
  { id: 'sabnzbd',    label: 'SABnzbd',      desc: 'Usenet downloader — URL is http://sabnzbd:8080. API key found in SABnzbd → Config → General → API Key.',  category: 'Downloads' },
  { id: 'nzbget',    label: 'NZBGet',       desc: 'Usenet downloader — URL is http://nzbget:6789. API key field: username:password (your NZBGet control credentials from Settings → Security).',  category: 'Downloads' },
  // Print Media
  { id: 'kavita',       label: 'Kavita',       desc: 'Self-hosted manga, comic & book server — API key field: Auth Key from Kavita → (your avatar) → User Settings → Manage Auth Keys.', category: 'Print Media' },
  { id: 'komga',        label: 'Komga',        desc: 'Self-hosted comic book & manga server',                        category: 'Print Media' },
  { id: 'mylar3',    label: 'Mylar3',    desc: 'Comics/manga manager — URL is http://mylar3:8090. API key found in Mylar3 → Settings → Web Interface → API Key.', category: 'Print Media' },
  { id: 'kapowarr',  label: 'Kapowarr',  desc: 'Western comics manager — URL is http://kapowarr:5656. API key found in Kapowarr → Settings → API Key.', category: 'Print Media' },
  { id: 'tranga',    label: 'Tranga',    desc: 'Manga downloader — URL is http://tranga:9898. No API key required by default.', category: 'Print Media' },
  { id: 'audiobookshelf', label: 'Audiobookshelf', desc: 'Audiobook, podcast & ebook server (username:password or bare API key)', category: 'Print Media' },
  // Music
  { id: 'navidrome',     label: 'Navidrome',     desc: 'Self-hosted music server / Subsonic API (username:password in API key field)', category: 'Music' },
  { id: 'spotify',    label: 'Spotify',    desc: 'Music streaming — no URL needed. API key: clientId:clientSecret from your Spotify Developer Dashboard app. After creating, connect your Spotify account from the integration edit page.', category: 'Music' },
  { id: 'lastfm',     label: 'Last.fm',    desc: 'Music scrobbling tracker — no URL needed. API key: username:apiKey (colon-separated). Get your API key at last.fm/api.', category: 'Music' },
  { id: 'plexmusic',  label: 'Plex Music', desc: 'Personal Plex music companion — now playing with playback controls, music library stats, playlists, and your Watchlist. No secret needed; borrows connectivity from an existing system Plex integration and connects as one of its Home users (family members without separate plex.tv logins). External shared-library users aren\'t supported yet.', category: 'Music' },
  // Gaming
  { id: 'steam',        label: 'Steam',        desc: 'Steam library, activity & store',                             category: 'Gaming' },
  { id: 'romm',         label: 'RomM',         desc: 'Self-hosted ROM manager — URL is http://romm:8080. API key field: username:password for Basic Auth, or an rmm_ bearer token from RomM → Settings → API Keys.', category: 'Gaming' },
  { id: 'pterodactyl',  label: 'Pterodactyl',  desc: 'Game server panel — URL is http://pterodactyl. API key field: Client API key (ptlc_…) from Pterodactyl → Account → API Credentials.', category: 'Gaming' },
  // Storage & Virtualization
  { id: 'truenas',      label: 'TrueNAS',      desc: 'NAS management',                                              category: 'Storage & Virtualization' },
  { id: 'unraid',       label: 'Unraid',       desc: 'NAS & storage server',                                        category: 'Storage & Virtualization' },
  { id: 'omv',          label: 'OpenMediaVault', desc: 'NAS & storage server',                                      category: 'Storage & Virtualization' },
  { id: 'synology',     label: 'Synology',     desc: 'Synology DSM NAS',                                            category: 'Storage & Virtualization' },
  { id: 'qnap',         label: 'QNAP',         desc: 'QNAP QTS NAS',                                                category: 'Storage & Virtualization' },
  { id: 'proxmox',      label: 'Proxmox',      desc: 'Hypervisor',                                                  category: 'Storage & Virtualization' },
  { id: 'nextcloud',  label: 'Nextcloud',   desc: 'File cloud — URL is https://cloud.example.com. API key field: username:password (use an app password from Nextcloud → Settings → Security → App passwords).', category: 'Storage & Virtualization' },
  { id: 'scrutiny',   label: 'Scrutiny',    desc: 'Disk SMART health — URL is http://scrutiny:8080. No API key required — leave the field blank. Scrutiny runs unauthenticated by default.', category: 'Storage & Virtualization' },
  // Network & Security
  { id: 'opnsense',     label: 'OPNsense',     desc: 'Firewall/router',                                             category: 'Network & Security' },
  { id: 'pfsense',      label: 'pfSense',      desc: 'Firewall/router (requires pfSense-pkg-API package; API key or username:password)', category: 'Network & Security' },
  { id: 'openwrt',      label: 'OpenWrt',      desc: 'Router (username:password; default username is root)',         category: 'Network & Security' },
  { id: 'omada',        label: 'Omada SDN',    desc: 'TP-Link Omada SDN controller — Open API v2 (Omada 5.0+); username:password in API key field', category: 'Network & Security' },
  { id: 'unifi',        label: 'UniFi',        desc: 'Ubiquiti UniFi Network Application — API key (v9.3.43+) or username:password; supports WebSocket real-time events', category: 'Network & Security' },
  { id: 'traefik',      label: 'Traefik',      desc: 'Traefik reverse proxy — API must be enabled (--api=true); no auth, Basic Auth (username:password), or Bearer token', category: 'Network & Security' },
  { id: 'nginxpm',      label: 'Nginx Proxy Manager', desc: 'NPM reverse proxy — email:password in API key field. URL is http://your-npm:81/. Creates a JWT session token automatically.', category: 'Network & Security' },
  { id: 'cloudflare',   label: 'Cloudflare',   desc: 'Cloudflare — API token (Zone:Read + Analytics:Read + Tunnel:Read); or email:globalApiKey for legacy auth. Leave URL blank.', category: 'Network & Security' },
  { id: 'pihole',       label: 'Pi-hole',      desc: 'Pi-hole DNS sinkhole — v5: bare API token from Settings → API; v6: app password or web password. URL is http://your-pihole/. No auth needed for basic v5 stats.', category: 'Network & Security' },
  { id: 'adguard',      label: 'AdGuard Home', desc: 'AdGuard Home DNS sinkhole — username:password in API key field. URL is http://your-adguard:3000/. Requires admin credentials.', category: 'Network & Security' },
  { id: 'nextdns',      label: 'NextDNS',      desc: 'NextDNS cloud DNS — bare API key (from nextdns.io → Account → API). URL: https://api.nextdns.io/profiles/{profileId}. Leave UI URL as https://my.nextdns.io or blank.', category: 'Network & Security' },
  { id: 'gluetun',      label: 'Gluetun',      desc: 'VPN container',                                               category: 'Network & Security' },
  { id: 'wgeasy',       label: 'wg-easy',      desc: 'WireGuard VPN manager — bare password in API key field (leave blank for no-auth instances). URL is http://your-wgeasy:51821/.', category: 'Network & Security' },
  { id: 'tailscale',    label: 'Tailscale',    desc: 'Tailscale mesh VPN — API token (tskey-api-...) from login.tailscale.com → Settings → Keys. Leave URL blank; Stoa always calls api.tailscale.com.', category: 'Network & Security' },
  { id: 'netbird',    label: 'Netbird',     desc: 'WireGuard mesh VPN — URL is https://api.netbird.io (cloud) or http://netbird:80 (self-hosted). API key field: Personal Access Token from Netbird → Settings → Personal Access Tokens.', category: 'Network & Security' },
  { id: 'authentik',    label: 'Authentik',    desc: 'Identity provider',                                           category: 'Network & Security' },
  { id: 'keycloak',     label: 'Keycloak',     desc: 'Identity provider — API key field: realm:clientId:clientSecret from a confidential client with service account roles view-events and query-users', category: 'Network & Security' },
  { id: 'kuma',         label: 'Uptime Kuma',  desc: 'Status monitoring',                                           category: 'Network & Security' },
  { id: 'prometheus',   label: 'Prometheus',   desc: 'Prometheus metrics server — URL is http://prometheus:9090. No auth by default; use username:password for Basic Auth or a bare token for Bearer. Optional PromQL metric cards configured per panel.', category: 'Network & Security' },
  { id: 'grafana',      label: 'Grafana',      desc: 'Grafana observability platform — URL is http://grafana:3000. Create a Service Account (Admin → Service Accounts) and generate a token; paste the token in the API key field.', category: 'Network & Security' },
  // Finance
  { id: 'fireflyiii',   label: 'Firefly III',  desc: 'Personal finance manager — URL is http://firefly:8080. API key field: Personal Access Token from Firefly III → Profile → OAuth → Personal Access Tokens.', category: 'Finance' },
  { id: 'actualbudget', label: 'Actual Budget', desc: 'Envelope budgeting — requires the actual-http-api sidecar (not your actual-server directly). URL is http://actual-http-api:5007. API key field: the API_KEY you set when deploying actual-http-api.', category: 'Finance' },
  { id: 'ghostfolio',  label: 'Ghostfolio',    desc: 'Portfolio tracker — URL is http://ghostfolio:3333 (or your cloud URL). API key field: security token from Ghostfolio → User Account → Security Token.', category: 'Finance' },
  { id: 'coinbase',    label: 'Coinbase',       desc: 'Coinbase portfolio — no URL needed. API key field: keyName:privateKey (colon-separated, values from the JSON file Coinbase downloads when you create the key). Create a CDP key at coinbase.com/settings/api → New API Key, choose Ed25519 (default). The JSON has a "name" field (organizations/…/apiKeys/…) and a "privateKey" field — join them with a colon.', category: 'Finance' },
  { id: 'stocks',       label: 'Stocks',       desc: 'US stock quotes with sparklines (Yahoo Finance, no API key)', category: 'Finance' },
  { id: 'crypto',       label: 'Crypto',       desc: 'Cryptocurrency prices with sparklines (CoinGecko)',           category: 'Finance' },
  // Digital Life
  { id: 'homeassistant', label: 'Home Assistant', desc: 'Smart home platform',                                      category: 'Digital Life' },
  { id: 'frigate',     label: 'Frigate',     desc: 'NVR (network video recorder) — URL is http://frigate:8971. Leave API key blank for unauthenticated local instances (port 5000). For authenticated instances, generate a Bearer token in Frigate → Settings → Users.', category: 'Digital Life' },
  { id: 'blueiris',   label: 'Blue Iris',   desc: 'Windows NVR — URL is http://192.168.1.x:81 (default port 81, configurable). API key field: username:password of a Blue Iris user account. Enable the web server in Blue Iris → Settings → Web server.', category: 'Digital Life' },
  { id: 'wger',       label: 'wger',       desc: 'Workout manager — URL is http://wger:80. API key field: permanent API key from wger → Dashboard → API (top-right menu).', category: 'Digital Life' },
  { id: 'fittrackee', label: 'Fittrackee', desc: 'Activity tracker — URL is http://fittrackee:5000. API key field: email:password of your Fittrackee account.', category: 'Digital Life' },
  { id: 'strava',    label: 'Strava',    desc: 'Running & cycling tracker — no URL needed. API key: clientId:clientSecret from your Strava Developer Portal app. After creating, connect your Strava account from the integration edit page.', category: 'Digital Life' },
  { id: 'duolingo',  label: 'Duolingo',  desc: 'Language learning — no URL needed. API key: username:password of your Duolingo account (unofficial read-only API).', category: 'Digital Life' },
  { id: 'homebox',   label: 'Homebox',   desc: 'Home inventory — URL is http://homebox:7745. API key field: email:password of your Homebox account.', category: 'Digital Life' },
  { id: 'grocy',       label: 'Grocy',           desc: 'Household management — URL is http://grocy:80 (or your instance URL). API key field: generated in Grocy → Manage API Keys (or Settings → User API Keys).', category: 'Digital Life' },
  { id: 'mealie',      label: 'Mealie',         desc: 'Recipe manager & meal planner — URL is http://mealie:9000. API key field: long-lived API token from Mealie → User Settings → API Tokens → Create Token.', category: 'Digital Life' },
  { id: 'tandoor',     label: 'Tandoor',          desc: 'Recipe manager — URL is http://tandoor:8080. API key field: token from Tandoor → User Menu → API Token.', category: 'Digital Life' },
  { id: 'lubelogger',  label: 'LubeLogger',       desc: 'Vehicle maintenance tracker — URL is http://lubelogger:8080. API key field: x-api-key from LubeLogger → Profile → API Keys. Alternatively, use username:password for Basic Auth. Also works as a calendar source for date-bound reminders.', category: 'Digital Life' },
  { id: 'monica',     label: 'Monica',     desc: 'Personal CRM — URL is http://monica:8080. API key field: bearer token generated in Monica → Settings → API → Create New Token.', category: 'Digital Life' },
  { id: 'life360',   label: 'Life360',   desc: 'Family location sharing — no official API; secret is a session token you extract by hand from your browser (see docs), and it can expire without warning', category: 'Digital Life' },
  { id: 'paperless',   label: 'Paperless-ngx', desc: 'Document management — URL is http://paperless:8000 (or your public URL). API key field: token generated in Paperless-ngx → Settings → API → Generate Token.', category: 'Digital Life' },
  { id: 'docspell',    label: 'Docspell',       desc: 'Document manager — URL is http://docspell:7880. API key field: account:password where account is "collective/user" for multi-user setups or just "user" for a single-collective instance.', category: 'Digital Life' },
  { id: 'github',      label: 'GitHub',      desc: 'GitHub activity — no URL needed. API key: Personal Access Token from GitHub → Settings → Developer settings → Personal access tokens. Token needs "public_repo" read scope minimum; "read:user" for profile.', category: 'Digital Life' },
  { id: 'caldav',      label: 'CalDAV',       desc: 'Read/write calendar (Nextcloud, Fastmail, Radicale, Baïkal, Synology). URL is a calendar collection, e.g. https://cloud.example.com/remote.php/dav/calendars/USER/personal/. Secret: username:password — use an app password. Add it to a Calendar panel as a source.', category: 'Digital Life' },
  // Online Content
  { id: 'youtube',      label: 'YouTube',      desc: 'Subscription feed — recent videos from channels you follow. No URL needed. API key: clientId:clientSecret from Google Cloud Console (YouTube Data API v3). After creating, connect your Google account from the integration edit page.', category: 'Online Content' },
  { id: 'twitch',       label: 'Twitch',       desc: 'Live stream dashboard — no URL needed. API key: clientId:clientSecret from your Twitch Developer Console app. After creating, connect your Twitch account from the integration edit page.', category: 'Online Content' },
  { id: 'trakt',        label: 'Trakt (legacy)', desc: 'Movie & TV watch tracking with artwork carousels and add-to-Radarr/Sonarr. Trakt ended free API-application access in 2026 (existing apps deactivated, new ones require paid VIP) — this integration is not developed further. See TMDB below for the discovery/add-to-Radarr-Sonarr replacement.', category: 'Online Content' },
  { id: 'tmdb',         label: 'TMDB',         desc: 'Movie & TV discovery — trending/popular/upcoming/top-rated with poster carousels and one-click add-to-Radarr/Sonarr, sourced directly from TMDB (no third-party dependency risk). No URL needed. API key: v3 key or v4 Read Access Token from themoviedb.org/settings/api. Rating-ceiling filtering and personal account connect available below.', category: 'Online Content' },
  { id: 'rss',          label: 'RSS Feed',     desc: 'RSS or Atom feed reader',                                     category: 'Online Content' },
  { id: 'weather',      label: 'Weather',      desc: 'Current conditions & forecast (Open-Meteo, no key required)', category: 'Online Content' },
  { id: 'sports',       label: 'Sports',       desc: 'NHL, NFL, NBA, MLB scores, standings & schedule (ESPN)',      category: 'Online Content' },
]

const NO_TEST_TYPES = ['weather', 'steam', 'rss', 'sports', 'stocks', 'crypto', 'youtube', 'plexmusic']
const NO_URL_REQUIRED = ['weather', 'steam', 'rss', 'sports', 'stocks', 'crypto', 'spotify', 'lastfm', 'strava', 'duolingo', 'github', 'trakt', 'tmdb', 'twitch', 'youtube', 'coinbase', 'cloudflare', 'tailscale', 'life360', 'plexmusic']
// Types the backend accepts with an empty api_url when running a connection
// test — mirrors integrationConfigTypes in
// backend/internal/handlers/integrations_crud.go. Enables the Test button for
// no-URL types like Life360/Tailscale (which have a working test that ignores
// the URL). Deliberately excludes coinbase/cloudflare, whose test path still
// requires a URL on the backend.
const URL_OPTIONAL_TEST_TYPES = [
  'stocks', 'crypto', 'sports', 'weather', 'youtube', 'twitch', 'spotify',
  'lastfm', 'strava', 'trakt', 'tmdb', 'github', 'steam', 'duolingo', 'rss',
  'tailscale', 'life360',
]
// Per-type default refresh interval (seconds) shown when creating an
// integration. Mirrors defaultRefreshSecs in
// backend/internal/handlers/integrations_crud.go for the types where the
// generic 60s default is wrong; the backend stays the source of truth (it
// re-applies its own default if we ever send a value < 15).
const DEFAULT_REFRESH_SECS: Record<string, number> = {
  life360: 120,
}
const defaultRefreshFor = (t: string) => DEFAULT_REFRESH_SECS[t] ?? 60
// Types whose calendar-source events come from a real windowed upstream
// query (start/end params) — the only ones where a fetch-size ceiling here
// actually matters. Others (Kapowarr, Maintainerr, etc.) always fetch
// everything upcoming regardless of any days-ahead value.
const CAL_WINDOWED_TYPES = ['sonarr', 'radarr', 'readarr', 'lidarr', 'homeassistant', 'caldav']
const CAL_DAYS_OPTIONS = [7, 14, 30, 60, 90]
// Types covered by the Security Posture panel — keep in sync with
// securityPostureTypes in backend/internal/handlers/security_posture.go
const SEC_POSTURE_TYPES = [
  'truenas', 'unraid', 'omv', 'synology', 'qnap', 'proxmox', 'opnsense',
  'pfsense', 'openwrt', 'traefik', 'nginxpm', 'authentik', 'keycloak', 'nextcloud',
  'omada', 'unifi', 'pihole', 'adguard', 'tailscale', 'netbird',
  'plex', 'jellyfin', 'grafana', 'homeassistant',
]
// Types the backend fetches via NVD CPE match and filters to the running
// version automatically — keep in sync with securityPostureCPE in
// backend/internal/handlers/security_posture.go. For these the ignore-date is
// not used (version filtering is exact), so the form shows a note instead.
const SEC_POSTURE_CPE_TYPES = [
  'opnsense', 'authentik', 'traefik', 'plex', 'jellyfin', 'grafana', 'homeassistant',
]

interface Props {
  scope: 'system' | 'personal'
  secrets: any[]
  integration?: Integration          // undefined = create, provided = edit
  onSaved: () => void
  onCancel: () => void
  onDeleted?: () => void             // edit mode only
  onSecretsChanged: (s: any[]) => void
  children?: React.ReactNode         // group assignment slot (system scope, edit mode)
}

export default function IntegrationForm({
  scope, secrets, integration,
  onSaved, onCancel, onDeleted, onSecretsChanged, children,
}: Props) {
  const isEdit = !!integration
  const secretScope = scope === 'system' ? 'shared' : 'personal'

  // ── Core fields ────────────────────────────────────────────────────────────
  const [name, setName] = useState(integration?.name ?? '')
  const [type, setType] = useState(integration?.type ?? 'sonarr')
  const [apiUrl, setApiUrl] = useState(integration?.apiUrl ?? '')
  const [uiUrl, setUiUrl] = useState(integration?.uiUrl ?? '')
  const [secretId, setSecretId] = useState(integration?.secretId ?? '')
  const [skipTls, setSkipTls] = useState(integration?.skipTls ?? false)
  const [refreshSecs, setRefreshSecs] = useState(integration?.refreshSecs ?? defaultRefreshFor(integration?.type ?? 'sonarr'))
  const [calDaysAhead, setCalDaysAhead] = useState<number>(() => {
    try { return JSON.parse(integration?.config || '{}').daysAhead || 30 } catch { return 30 }
  })
  const [cveIgnoreBefore, setCveIgnoreBefore] = useState<string>(() => {
    try { return JSON.parse(integration?.config || '{}').cveIgnoreBefore || '' } catch { return '' }
  })
  // Version last seen by the Security Posture worker (read-only); when it
  // changes the worker stamps cveIgnoreBefore with the detection date.
  const detectedVersion: string = (() => {
    try { return JSON.parse(integration?.config || '{}').detectedVersion || '' } catch { return '' }
  })()

  // ── Prometheus custom metrics ──────────────────────────────────────────────
  type PromMetric = { label: string; query: string; unit: string }
  const parsePromMetrics = (cfg: string): PromMetric[] => {
    try { return (JSON.parse(cfg) as any).metrics ?? [] } catch { return [] }
  }
  const [promMetrics, setPromMetrics] = useState<PromMetric[]>(
    () => parsePromMetrics(integration?.config ?? '{}')
  )

  // ── Integration config (stocks/crypto/sports/weather — what to ingest) ────
  // Initialized from integration.config; for legacy weather rows still using
  // api_url pipe format, convert on load so the UI shows the correct city.
  const [igConfig, setIgConfig] = useState<string>(() => {
    const cfg = integration?.config ?? '{}'
    if (cfg !== '{}' && cfg !== '') return cfg
    // Legacy weather: api_url holds "lat|lon|city|unit"
    const legacy = integration?.apiUrl ?? ''
    if (integration?.type === 'weather' && legacy.includes('|')) {
      const [lat, lon, city = '', unit = 'f'] = legacy.split('|')
      return JSON.stringify({ lat, lon, city, unit })
    }
    return '{}'
  })

  // ── Form state ─────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pickerView, setPickerView] = useState<'tiles' | 'catalog'>('tiles')

  // ── Inline secret creation ─────────────────────────────────────────────────
  const [showNewSecret, setShowNewSecret] = useState(false)
  const [newSecretName, setNewSecretName] = useState('')
  const [newSecretValue, setNewSecretValue] = useState('')
  const [savingSecret, setSavingSecret] = useState(false)

  // ── Weather geocoder ───────────────────────────────────────────────────────
  const [geoQuery, setGeoQuery] = useState('')
  const [geoResults, setGeoResults] = useState<any[]>([])
  const [geoSearching, setGeoSearching] = useState(false)

  // ── Steam vanity resolver ──────────────────────────────────────────────────
  const [steamVanity, setSteamVanity] = useState('')
  const [steamResolving, setSteamResolving] = useState(false)

  // ── Spotify OAuth status ───────────────────────────────────────────────────
  const [spotifyStatus, setSpotifyStatus] = useState<{
    connected: boolean; displayName?: string; product?: string
  } | null>(null)
  const [spotifyDisconnecting, setSpotifyDisconnecting] = useState(false)

  useEffect(() => {
    if (!isEdit || integration?.type !== 'spotify') return
    fetch(`/api/spotify/status?integrationId=${integration!.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('stoa_token') ?? ''}` } })
      .then(r => r.json())
      .then(d => setSpotifyStatus(d))
      .catch(() => setSpotifyStatus({ connected: false }))
  }, [isEdit, integration?.id, integration?.type])

  // ── Strava OAuth status ────────────────────────────────────────────────────
  const [stravaStatus, setStravaStatus] = useState<{
    connected: boolean; athleteName?: string
  } | null>(null)
  const [stravaDisconnecting, setStravaDisconnecting] = useState(false)

  useEffect(() => {
    if (!isEdit || integration?.type !== 'strava') return
    fetch(`/api/strava/status?integrationId=${integration!.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('stoa_token') ?? ''}` } })
      .then(r => r.json())
      .then(d => setStravaStatus(d))
      .catch(() => setStravaStatus({ connected: false }))
  }, [isEdit, integration?.id, integration?.type])

  // ── Twitch OAuth status ────────────────────────────────────────────────────
  const [twitchStatus, setTwitchStatus] = useState<{
    connected: boolean; userLogin?: string; userName?: string
  } | null>(null)
  const [twitchDisconnecting, setTwitchDisconnecting] = useState(false)

  useEffect(() => {
    if (!isEdit || integration?.type !== 'twitch') return
    fetch(`/api/twitch/status?integrationId=${integration!.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('stoa_token') ?? ''}` } })
      .then(r => r.json())
      .then(d => setTwitchStatus(d))
      .catch(() => setTwitchStatus({ connected: false }))
  }, [isEdit, integration?.id, integration?.type])

  // ── YouTube OAuth status ───────────────────────────────────────────────────
  const [youtubeStatus, setYoutubeStatus] = useState<{
    connected: boolean; channelTitle?: string; profileImageUrl?: string
  } | null>(null)
  const [youtubeDisconnecting, setYoutubeDisconnecting] = useState(false)

  useEffect(() => {
    if (!isEdit || integration?.type !== 'youtube') return
    fetch(`/api/youtube/status?integrationId=${integration!.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('stoa_token') ?? ''}` } })
      .then(r => r.json())
      .then(d => setYoutubeStatus(d))
      .catch(() => setYoutubeStatus({ connected: false }))
  }, [isEdit, integration?.id, integration?.type])

  // ── TMDB account connect status ────────────────────────────────────────────
  const [tmdbStatus, setTmdbStatus] = useState<{ connected: boolean; username?: string } | null>(null)
  const [tmdbDisconnecting, setTmdbDisconnecting] = useState(false)

  useEffect(() => {
    if (!isEdit || integration?.type !== 'tmdb') return
    fetch(`/api/tmdb/status?integrationId=${integration!.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('stoa_token') ?? ''}` } })
      .then(r => r.json())
      .then(d => setTmdbStatus(d))
      .catch(() => setTmdbStatus({ connected: false }))
  }, [isEdit, integration?.id, integration?.type])

  // ── Plex Music (borrows connectivity from a system Plex integration) ──────
  const [plexSourceOptions, setPlexSourceOptions] = useState<{ id: string; name: string }[]>([])
  const [plexMusicStatus, setPlexMusicStatus] = useState<{ connected: boolean; username?: string; thumbUrl?: string } | null>(null)
  const [plexHomeUsers, setPlexHomeUsers] = useState<{ id: string; title: string; thumb: string; protected: boolean }[] | null>(null)
  const [plexSelectedHomeUser, setPlexSelectedHomeUser] = useState('')
  const [plexPin, setPlexPin] = useState('')
  const [plexConnecting, setPlexConnecting] = useState(false)
  const [plexDisconnecting, setPlexDisconnecting] = useState(false)
  const [plexConnectError, setPlexConnectError] = useState('')

  useEffect(() => {
    if ((isEdit ? integration?.type : type) !== 'plexmusic') return
    integrationsApi.list()
      .then(r => setPlexSourceOptions((r.data || []).filter((i: any) => i.type === 'plex').map((i: any) => ({ id: i.id, name: i.name }))))
      .catch(() => setPlexSourceOptions([]))
  }, [isEdit, integration?.type, type])

  useEffect(() => {
    if (!isEdit || integration?.type !== 'plexmusic') return
    fetch(`/api/plexmusic/status?integrationId=${integration!.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('stoa_token') ?? ''}` } })
      .then(r => r.json())
      .then(d => setPlexMusicStatus(d))
      .catch(() => setPlexMusicStatus({ connected: false }))
  }, [isEdit, integration?.id, integration?.type])

  useEffect(() => {
    if (!isEdit || integration?.type !== 'plexmusic' || plexMusicStatus === null || plexMusicStatus.connected) return
    fetch(`/api/plexmusic/home-users?integrationId=${integration!.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('stoa_token') ?? ''}` } })
      .then(r => r.json())
      .then(d => setPlexHomeUsers(d.users || []))
      .catch(() => setPlexHomeUsers([]))
  }, [isEdit, integration?.id, integration?.type, plexMusicStatus])

  const plexMusicConnect = async () => {
    if (!integration || !plexSelectedHomeUser) return
    setPlexConnecting(true)
    setPlexConnectError('')
    try {
      const chosen = plexHomeUsers?.find(u => u.id === plexSelectedHomeUser)
      const resp = await fetch('/api/plexmusic/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('stoa_token') ?? ''}` },
        body: JSON.stringify({
          integrationId: integration.id, homeUserId: plexSelectedHomeUser,
          homeUserTitle: chosen?.title ?? '', homeUserThumb: chosen?.thumb ?? '', pin: plexPin,
        }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => null)
        setPlexConnectError(body?.error || `Connect failed (HTTP ${resp.status})`)
        return
      }
      const r = await fetch(`/api/plexmusic/status?integrationId=${integration.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('stoa_token') ?? ''}` } })
      setPlexMusicStatus(await r.json())
    } catch {
      setPlexConnectError('Connect failed — request error')
    } finally { setPlexConnecting(false) }
  }

  // ── Test connection ────────────────────────────────────────────────────────
  const [testResult, setTestResult] = useState<{
    ok: boolean; error?: string; tlsError?: boolean; skipTlsWorks?: boolean
  } | null>(null)
  const [testing, setTesting] = useState(false)

  // Re-init when switching to a different integration in edit mode
  useEffect(() => {
    if (!integration) return
    setName(integration.name)
    setType(integration.type)
    setApiUrl(integration.apiUrl)
    setUiUrl(integration.uiUrl ?? '')
    setSecretId(integration.secretId ?? '')
    setSkipTls(integration.skipTls ?? false)
    setRefreshSecs(integration.refreshSecs ?? defaultRefreshFor(integration.type))
    try { setCalDaysAhead(JSON.parse(integration.config || '{}').daysAhead || 30) } catch { setCalDaysAhead(30) }
    setTestResult(null)
    setGeoQuery(''); setGeoResults([])
    setSteamVanity('')
    setPromMetrics(parsePromMetrics(integration.config ?? '{}'))
    // Re-init integration config; migrate legacy weather api_url pipe format
    const cfg = integration.config ?? '{}'
    if (cfg !== '{}' && cfg !== '') {
      setIgConfig(cfg)
    } else if (integration.type === 'weather' && integration.apiUrl?.includes('|')) {
      const [lat, lon, city = '', unit = 'f'] = integration.apiUrl.split('|')
      setIgConfig(JSON.stringify({ lat, lon, city, unit }))
    } else {
      setIgConfig('{}')
    }
  }, [integration?.id])

  const handleTypeChange = (t: string) => {
    setType(t)
    setApiUrl(
      t === 'spotify'   ? 'https://api.spotify.com' :
      t === 'lastfm'    ? 'https://www.last.fm' :
      t === 'strava'    ? 'https://www.strava.com' :
      t === 'duolingo'  ? 'https://www.duolingo.com' :
      t === 'github'    ? 'https://api.github.com' :
      t === 'trakt'     ? 'https://api.trakt.tv' :
      t === 'twitch'    ? 'https://api.twitch.tv' :
      ''
    )
    setRefreshSecs(defaultRefreshFor(t))
    setTestResult(null)
    setGeoQuery(''); setGeoResults([])
    setSteamVanity('')
  }

  const saveNewSecret = async () => {
    if (!newSecretName.trim() || !newSecretValue.trim()) return
    setSavingSecret(true)
    try {
      const res = await secretsApi.create({
        name: newSecretName.trim(), value: newSecretValue.trim(), scope: secretScope
      })
      const newSec = { id: res.data.id, name: newSecretName.trim() }
      onSecretsChanged([...secrets, newSec])
      setSecretId(newSec.id)
      setNewSecretName(''); setNewSecretValue(''); setShowNewSecret(false)
    } finally { setSavingSecret(false) }
  }

  const searchGeo = async () => {
    if (!geoQuery.trim()) return
    setGeoSearching(true)
    try { const r = await weatherApi.geocode(geoQuery); setGeoResults(r.data || []) }
    finally { setGeoSearching(false) }
  }

  const selectGeo = (r: any) => {
    const city = [r.name, r.admin1, r.country].filter(Boolean).join(', ')
    setIgConfig(JSON.stringify({ lat: String(r.latitude), lon: String(r.longitude), city, unit: 'f' }))
    setGeoResults([]); setGeoQuery('')
  }

  const resolveVanity = async () => {
    if (!steamVanity.trim() || !secretId) return
    setSteamResolving(true)
    try {
      const sec = secrets.find(s => s.id === secretId)
      if (!sec) { alert('Select API key first'); return }
      const r = await steamApi.resolveVanity(steamVanity, sec.value || secretId)
      setApiUrl(r.data.steamId); setSteamVanity('')
    } catch { alert('Could not resolve vanity URL — check API key and username') }
    finally { setSteamResolving(false) }
  }

  const test = async () => {
    setTesting(true); setTestResult(null)
    try {
      const res = await integrationsApi.test({
        type, apiUrl, secretId: secretId || undefined, skipTls
      })
      setTestResult(res.data)
    } catch { setTestResult({ ok: false, error: 'Request failed' }) }
    finally { setTesting(false) }
  }

  const CONFIG_TYPES = ['stocks', 'crypto', 'sports', 'weather']
  const effectiveApiUrl = CONFIG_TYPES.includes(isEdit ? integration!.type : type) ? '' : apiUrl

  const buildIgConfig = (t: string): string => {
    if (t === 'prometheus') {
      const valid = promMetrics.filter(m => m.query.trim() !== '')
      return valid.length > 0 ? JSON.stringify({ metrics: valid }) : '{}'
    }
    if (CAL_WINDOWED_TYPES.includes(t)) {
      let base: Record<string, unknown> = {}
      try { base = JSON.parse(igConfig || '{}') } catch { /* ignore malformed */ }
      return JSON.stringify({ ...base, daysAhead: calDaysAhead })
    }
    if (SEC_POSTURE_TYPES.includes(t)) {
      let base: Record<string, unknown> = {}
      try { base = JSON.parse(igConfig || '{}') } catch { /* ignore malformed */ }
      if (cveIgnoreBefore) return JSON.stringify({ ...base, cveIgnoreBefore })
      const { cveIgnoreBefore: _drop, ...rest } = base as any
      return Object.keys(rest).length > 0 ? JSON.stringify(rest) : '{}'
    }
    return igConfig
  }

  const save = async () => {
    if (!name.trim() || (!NO_URL_REQUIRED.includes(type) && !apiUrl)) return
    setSaving(true)
    const resolvedType = isEdit ? integration!.type : type
    const configToSave = buildIgConfig(resolvedType)
    try {
      if (isEdit && integration) {
        const api = (integration.createdBy && integration.createdBy !== 'SYSTEM')
          ? myIntegrationsApi : integrationsApi
        await api.update(integration.id, {
          name: name.trim(), apiUrl: effectiveApiUrl, uiUrl,
          config: configToSave,
          secretId: secretId || undefined, skipTls, refreshSecs,
        })
      } else {
        await integrationsApi.create({
          name: name.trim(), type, apiUrl: effectiveApiUrl, uiUrl,
          config: configToSave,
          secretId: secretId || undefined,
          skipTls, refreshSecs,
          ...(scope === 'personal' ? { scope: 'personal' } : {}),
        })
      }
      onSaved()
    } finally { setSaving(false) }
  }

  const deleteIntegration = async () => {
    if (!integration || !confirm(`Delete integration "${integration.name}"?`)) return
    setDeleting(true)
    try {
      const api = (integration.createdBy && integration.createdBy !== 'SYSTEM')
        ? myIntegrationsApi : integrationsApi
      await api.delete(integration.id)
      onDeleted?.()
    } finally { setDeleting(false) }
  }

  const activeType = isEdit ? integration!.type : type
  const typeDef = INTEGRATION_TYPES.find(t => t.id === activeType)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Type picker — create mode only, shown first so type drives the rest of the form */}
      {!isEdit && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label className="label" style={{ margin: 0 }}>Type</label>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              {(['tiles', 'catalog'] as const).map(v => (
                <button key={v} type="button" onClick={() => setPickerView(v)} style={{
                  fontSize: 11, padding: '3px 10px', cursor: 'pointer', border: 'none',
                  background: pickerView === v ? 'var(--accent-bg)' : 'transparent',
                  color: pickerView === v ? 'var(--accent)' : 'var(--text-dim)',
                }}>{v === 'tiles' ? 'Tiles' : 'Catalog'}</button>
              ))}
            </div>
          </div>
          {pickerView === 'tiles'
            ? <TypeCardPicker types={INTEGRATION_TYPES} value={type} onChange={handleTypeChange} autoFocus />
            : <CatalogBrowser types={INTEGRATION_TYPES} value={type} onChange={handleTypeChange} autoFocus />}
        </div>
      )}

      {/* Row 1: Name, (edit: locked type), Secret */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 2, minWidth: 160 }}>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. My Sonarr" />
        </div>
        {isEdit && (
          <div style={{ flex: 1, minWidth: 120 }}>
            <label className="label">Type</label>
            <div style={{ padding: '6px 10px', borderRadius: 6, fontSize: 13,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              color: 'var(--text-muted)' }}>
              {typeDef?.label ?? activeType}
            </div>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 160 }}>
          <label className="label">API key secret</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="input" value={secretId}
              onChange={e => { setSecretId(e.target.value); setTestResult(null) }}
              style={{ cursor: 'pointer', flex: 1 }}>
              <option value="">— None —</option>
              {secrets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn btn-ghost" style={{ fontSize: 12, flexShrink: 0 }}
              onClick={() => setShowNewSecret(v => !v)}>
              {showNewSecret ? 'Cancel' : '+ New'}
            </button>
          </div>
        </div>
      </div>

      {/* Inline secret creation */}
      {showNewSecret && (
        <div style={{ padding: '10px 12px', borderRadius: 8,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label className="label">Name</label>
              <input className="input" value={newSecretName}
                onChange={e => setNewSecretName(e.target.value)}
                placeholder="e.g. Sonarr API Key" autoFocus />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Value</label>
              <input className="input" type="password" value={newSecretValue}
                onChange={e => setNewSecretValue(e.target.value)}
                placeholder="Paste key here" />
            </div>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 12, alignSelf: 'flex-start' }}
            disabled={savingSecret || !newSecretName || !newSecretValue}
            onClick={saveNewSecret}>
            {savingSecret ? <span className="spinner" /> : 'Save & select'}
          </button>
        </div>
      )}

      {/* URL config — varies by type */}
      {activeType === 'weather' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="label">Location</label>
          {(() => {
            try {
              const wc = JSON.parse(igConfig)
              return wc.city ? <div style={{ fontSize: 12, color: 'var(--accent2)' }}>📍 {wc.city}</div> : null
            } catch { return null }
          })()}
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input" value={geoQuery}
              onChange={e => setGeoQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchGeo()}
              placeholder={isEdit ? 'Search city to change location...' : 'Search city or region...'}
              style={{ flex: 1 }} />
            <button className="btn btn-ghost" style={{ fontSize: 12 }}
              onClick={searchGeo} disabled={geoSearching}>
              {geoSearching ? '...' : 'Search'}
            </button>
          </div>
          {geoResults.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              {geoResults.map((r, i) => (
                <button key={i} onClick={() => selectGeo(r)}
                  style={{ display: 'block', width: '100%', textAlign: 'left',
                    padding: '7px 12px', fontSize: 12, background: 'none', border: 'none',
                    borderBottom: i < geoResults.length-1 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer', color: 'var(--text)' }}>
                  {[r.name, r.admin1, r.country].filter(Boolean).join(', ')}
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 8 }}>
                    {r.latitude.toFixed(3)}, {r.longitude.toFixed(3)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label className="label" style={{ marginBottom: 0 }}>Unit:</label>
            <select className="input" style={{ maxWidth: 160, cursor: 'pointer' }}
              value={(apiUrl.includes('|') ? apiUrl.split('|')[3] : apiUrl.split(',')[3]) || 'f'}
              onChange={e => {
                const sep = apiUrl.includes('|') ? '|' : ','
                const parts = apiUrl.split(sep)
                while (parts.length < 4) parts.push('')
                parts[3] = e.target.value
                setApiUrl(parts.join(sep))
              }}>
              <option value="f">Fahrenheit (°F)</option>
              <option value="c">Celsius (°C)</option>
            </select>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            No API key required. Data from Open-Meteo (open source, free).
          </div>
        </div>
      ) : activeType === 'steam' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="label">
            Steam ID <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(17-digit number)</span>
          </label>
          <input className="input" value={apiUrl}
            onChange={e => setApiUrl(e.target.value)}
            placeholder="76561198000000000" />
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input" value={steamVanity}
              onChange={e => setSteamVanity(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && resolveVanity()}
              placeholder="Or enter profile vanity name to resolve..." style={{ flex: 1 }} />
            <button className="btn btn-ghost" style={{ fontSize: 12 }}
              onClick={resolveVanity} disabled={steamResolving || !secretId}>
              {steamResolving ? '...' : 'Resolve'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            API key required above. Find your Steam ID at steamid.io
          </div>
        </div>
      ) : activeType === 'spotify' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            API key: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>clientId:clientSecret</code> from
            your <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer"
              style={{ color: 'var(--accent)' }}>Spotify Developer Dashboard</a> app.
            Redirect URI to add in your app: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
              {window.location.origin}/api/spotify/callback</code>
          </div>
          {isEdit && integration && (
            <div style={{ padding: '10px 12px', borderRadius: 8,
              background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                Spotify Account
              </div>
              {spotifyStatus === null ? (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>
              ) : spotifyStatus.connected ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>
                      Connected as <strong>{spotifyStatus.displayName}</strong>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      {spotifyStatus.product === 'premium' ? '✓ Premium — playback controls enabled' : 'Free plan — info only'}
                    </div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 11, flexShrink: 0 }}
                    disabled={spotifyDisconnecting}
                    onClick={async () => {
                      setSpotifyDisconnecting(true)
                      try {
                        await fetch(`/api/spotify/disconnect?integrationId=${integration.id}`, {
                          method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('stoa_token') ?? ''}` }
                        })
                        setSpotifyStatus({ connected: false })
                      } finally { setSpotifyDisconnecting(false) }
                    }}>
                    {spotifyDisconnecting ? '…' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1 }}>
                    Not connected — authorize Stoa to access your Spotify account.
                  </div>
                  <button className="btn btn-primary" style={{ fontSize: 11, flexShrink: 0 }}
                    onClick={() => { const t = localStorage.getItem('stoa_token') ?? ''; window.location.href = `/api/spotify/auth?integrationId=${integration.id}&token=${t}` }}>
                    Connect Spotify
                  </button>
                </div>
              )}
            </div>
          )}
          {!isEdit && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              After creating the integration, open it to connect your Spotify account via OAuth.
            </div>
          )}
        </div>
      ) : activeType === 'lastfm' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            API key: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>username:apiKey</code> (colon-separated).
            Get a free API key at{' '}
            <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer"
              style={{ color: 'var(--accent)' }}>last.fm/api</a>.
            The username is your Last.fm profile name.
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            No URL or OAuth needed — read-only data only (scrobbling requires a separate app like Scrobbler).
          </div>
        </div>
      ) : activeType === 'plexmusic' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            No secret needed — this borrows connectivity from an existing system Plex integration and
            connects as one of its Home users (family members without separate plex.tv logins). External
            shared-library users (separate plex.tv accounts) aren't supported yet.
          </div>
          <div>
            <label className="label">Plex server</label>
            <select className="input" value={(() => { try { return JSON.parse(igConfig || '{}').sourceIntegrationId ?? '' } catch { return '' } })()}
              onChange={e => {
                let cfg: any = {}
                try { cfg = JSON.parse(igConfig || '{}') } catch { /* ignore malformed */ }
                cfg.sourceIntegrationId = e.target.value
                setIgConfig(JSON.stringify(cfg))
                setPlexHomeUsers(null)
              }}
              style={{ cursor: 'pointer' }}>
              <option value="">— Select —</option>
              {plexSourceOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            {plexSourceOptions.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>
                No system Plex integration found — add one first (Admin → Integrations → Plex).
              </div>
            )}
          </div>
          {isEdit && integration && (
            <div style={{ padding: '10px 12px', borderRadius: 8,
              background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                Plex Account
              </div>
              {plexMusicStatus === null ? (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>
              ) : plexMusicStatus.connected ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {plexMusicStatus.thumbUrl && (
                    <img src={plexMusicStatus.thumbUrl} alt="" width={28} height={28}
                      style={{ borderRadius: '50%', objectFit: 'cover' }} />
                  )}
                  <div style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>
                    Connected as <strong>{plexMusicStatus.username}</strong>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 11, flexShrink: 0 }}
                    disabled={plexDisconnecting}
                    onClick={async () => {
                      setPlexDisconnecting(true)
                      try {
                        await fetch(`/api/plexmusic/disconnect?integrationId=${integration.id}`, {
                          method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('stoa_token') ?? ''}` }
                        })
                        setPlexMusicStatus({ connected: false })
                        setPlexHomeUsers(null)
                      } finally { setPlexDisconnecting(false) }
                    }}>
                    {plexDisconnecting ? '…' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {plexHomeUsers === null ? (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading household members…</div>
                  ) : plexHomeUsers.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      No Home users found — save a Plex server selection above first, or set up Plex Home
                      (Plex Settings → Manage Library Access) if you haven't.
                    </div>
                  ) : (
                    <>
                      <select className="input" value={plexSelectedHomeUser}
                        onChange={e => { setPlexSelectedHomeUser(e.target.value); setPlexConnectError('') }} style={{ cursor: 'pointer' }}>
                        <option value="">— Which one are you? —</option>
                        {plexHomeUsers.map(u => <option key={u.id} value={u.id}>{u.title}</option>)}
                      </select>
                      {plexHomeUsers.find(u => u.id === plexSelectedHomeUser)?.protected && (
                        <input className="input" type="password" value={plexPin}
                          onChange={e => setPlexPin(e.target.value)}
                          placeholder="PIN" />
                      )}
                      <button className="btn btn-primary" style={{ fontSize: 11, alignSelf: 'flex-start' }}
                        disabled={!plexSelectedHomeUser || plexConnecting}
                        onClick={plexMusicConnect}>
                        {plexConnecting ? '…' : 'Connect'}
                      </button>
                      {plexConnectError && (
                        <div style={{ fontSize: 11, color: 'var(--red)', wordBreak: 'break-word' }}>
                          ⚠ {plexConnectError}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {!isEdit && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              After creating the integration, open it to connect as one of your Plex Home users.
            </div>
          )}
        </div>
      ) : activeType === 'strava' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            API key: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>clientId:clientSecret</code> from your{' '}
            <a href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer"
              style={{ color: 'var(--accent)' }}>Strava API settings</a>.
            Redirect URI to add in your app: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
              {window.location.origin}/api/strava/callback</code>
          </div>
          {isEdit && integration && (
            <div style={{ padding: '10px 12px', borderRadius: 8,
              background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                Strava Account
              </div>
              {stravaStatus === null ? (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>
              ) : stravaStatus.connected ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>
                      Connected as <strong>{stravaStatus.athleteName}</strong>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      Activities and stats will sync automatically.
                    </div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 11, flexShrink: 0 }}
                    disabled={stravaDisconnecting}
                    onClick={async () => {
                      setStravaDisconnecting(true)
                      try {
                        await fetch(`/api/strava/disconnect?integrationId=${integration.id}`, {
                          method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('stoa_token') ?? ''}` }
                        })
                        setStravaStatus({ connected: false })
                      } finally { setStravaDisconnecting(false) }
                    }}>
                    {stravaDisconnecting ? '…' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1 }}>
                    Not connected — authorize Stoa to access your Strava data.
                  </div>
                  <button className="btn btn-primary" style={{ fontSize: 11, flexShrink: 0,
                      background: '#FC4C02', borderColor: '#FC4C02' }}
                    onClick={() => { const t = localStorage.getItem('stoa_token') ?? ''; window.location.href = `/api/strava/auth?integrationId=${integration.id}&token=${t}` }}>
                    Connect Strava
                  </button>
                </div>
              )}
            </div>
          )}
          {!isEdit && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              After creating the integration, open it to connect your Strava account via OAuth.
            </div>
          )}
        </div>
      ) : activeType === 'duolingo' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            API key: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>username:password</code> — your Duolingo login credentials.
            Uses Duolingo's unofficial API (read-only). Your credentials are stored encrypted and only used to fetch a session token.
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            No URL or OAuth needed. Session tokens are cached for 12 hours to avoid repeated logins.
          </div>
        </div>
      ) : activeType === 'github' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            API key: Personal Access Token (classic or fine-grained) from{' '}
            <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer"
              style={{ color: 'var(--accent)' }}>GitHub → Settings → Developer settings → Personal access tokens</a>.
            Scopes needed: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>read:user</code> and{' '}
            <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>public_repo</code>.
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            No URL needed — Stoa always calls api.github.com. Shows your authenticated user profile, top repos by stars, and recent activity.
          </div>
        </div>
      ) : activeType === 'trakt' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--amber)' }}>
            Trakt ended free API-application access in 2026 — existing apps were deactivated and new ones now
            require a paid VIP subscription, with no official announcement. Stoa is not developing this
            integration further; see TMDB instead for discovery + add-to-Radarr/Sonarr without the dependency risk.
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            API key: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>clientId:username</code> (colon-separated).
            Get your Client ID at{' '}
            <a href="https://app.trakt.tv/settings/apps/api" target="_blank" rel="noreferrer"
              style={{ color: 'var(--accent)' }}>app.trakt.tv/settings/apps/api</a> — create an app and copy the Client ID
              (requires VIP as of 2026). Username is your Trakt profile name.
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            No URL or OAuth needed. Requires a public Trakt profile. Shows watch history, currently watching, and stats.
          </div>
        </div>
      ) : activeType === 'tmdb' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            API key: v3 key or v4 Read Access Token from{' '}
            <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer"
              style={{ color: 'var(--accent)' }}>themoviedb.org/settings/api</a> — both formats are auto-detected.
          </div>
          <div>
            <label className="label">
              Movie ratings ceiling{' '}
              <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional — blank = all)</span>
            </label>
            <input className="input" value={(() => { try { return JSON.parse(igConfig || '{}').movieRatings ?? '' } catch { return '' } })()}
              onChange={e => {
                let cfg: any = {}
                try { cfg = JSON.parse(igConfig || '{}') } catch { /* ignore malformed */ }
                cfg.movieRatings = e.target.value
                setIgConfig(JSON.stringify(cfg))
              }}
              placeholder="e.g. G, PG, PG-13" />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
              Comma-separated MPAA ratings. This integration's one API key has one fixed ceiling — for a
              different ceiling for a different audience, create a separate TMDB integration.
            </div>
          </div>
          <div>
            <label className="label">
              TV ratings ceiling{' '}
              <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional — blank = all)</span>
            </label>
            <input className="input" value={(() => { try { return JSON.parse(igConfig || '{}').showRatings ?? '' } catch { return '' } })()}
              onChange={e => {
                let cfg: any = {}
                try { cfg = JSON.parse(igConfig || '{}') } catch { /* ignore malformed */ }
                cfg.showRatings = e.target.value
                setIgConfig(JSON.stringify(cfg))
              }}
              placeholder="e.g. TV-Y, TV-G, TV-PG, TV-14" />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
              Comma-separated TV content ratings.
            </div>
          </div>
          {isEdit && integration && (
            <div style={{ padding: '10px 12px', borderRadius: 8,
              background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                TMDB Account
              </div>
              {tmdbStatus === null ? (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>
              ) : tmdbStatus.connected ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>
                    Connected as <strong>{tmdbStatus.username}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      Shows your personal TMDB lists on this panel.
                    </div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 11, flexShrink: 0 }}
                    disabled={tmdbDisconnecting}
                    onClick={async () => {
                      setTmdbDisconnecting(true)
                      try {
                        await fetch(`/api/tmdb/disconnect?integrationId=${integration.id}`, {
                          method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('stoa_token') ?? ''}` }
                        })
                        setTmdbStatus({ connected: false })
                      } finally { setTmdbDisconnecting(false) }
                    }}>
                    {tmdbDisconnecting ? '…' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1 }}>
                    Not connected — optional, only needed to show your personal TMDB lists.
                  </div>
                  <button className="btn btn-primary"
                    style={{ fontSize: 11, flexShrink: 0 }}
                    onClick={() => { const t = localStorage.getItem('stoa_token') ?? ''; window.location.href = `/api/tmdb/auth?integrationId=${integration.id}&token=${t}` }}>
                    Connect TMDB
                  </button>
                </div>
              )}
            </div>
          )}
          {!isEdit && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              After creating the integration, open it to optionally connect your TMDB account for personal lists.
            </div>
          )}
        </div>
      ) : activeType === 'youtube' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            API key: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>clientId:clientSecret</code> from{' '}
            <a href="https://console.cloud.google.com/apis/dashboard" target="_blank" rel="noreferrer"
              style={{ color: 'var(--accent)' }}>Google Cloud Console</a>{' '}
            (enable YouTube Data API v3, create OAuth 2.0 credentials).{' '}
            OAuth redirect URI to add: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
              {window.location.origin}/api/youtube/callback</code>
          </div>
          {isEdit && integration && (
            <div style={{ padding: '10px 12px', borderRadius: 8,
              background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                YouTube Account
              </div>
              {youtubeStatus === null ? (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>
              ) : youtubeStatus.connected ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    {youtubeStatus.profileImageUrl && (
                      <img src={youtubeStatus.profileImageUrl} alt=""
                        style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                    )}
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text)' }}>
                        Connected as <strong>{youtubeStatus.channelTitle}</strong>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                        Shows recent videos from your subscribed channels.
                      </div>
                    </div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 11, flexShrink: 0 }}
                    disabled={youtubeDisconnecting}
                    onClick={async () => {
                      setYoutubeDisconnecting(true)
                      try {
                        await fetch(`/api/youtube/disconnect?integrationId=${integration.id}`, {
                          method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('stoa_token') ?? ''}` }
                        })
                        setYoutubeStatus({ connected: false })
                      } finally { setYoutubeDisconnecting(false) }
                    }}>
                    {youtubeDisconnecting ? '…' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1 }}>
                    Not connected — authorize Stoa to read your YouTube subscriptions.
                  </div>
                  <button className="btn btn-primary"
                    style={{ fontSize: 11, flexShrink: 0, background: '#FF0000', borderColor: '#FF0000' }}
                    onClick={() => { const t = localStorage.getItem('stoa_token') ?? ''; window.location.href = `/api/youtube/auth?integrationId=${integration.id}&token=${t}` }}>
                    Connect YouTube
                  </button>
                </div>
              )}
            </div>
          )}
          {!isEdit && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              After creating the integration, open it to connect your Google account via OAuth.
            </div>
          )}
        </div>
      ) : activeType === 'twitch' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            API key: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>clientId:clientSecret</code> from your{' '}
            <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer"
              style={{ color: 'var(--accent)' }}>Twitch Developer Console</a> app.
            OAuth redirect URI to add: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
              {window.location.origin}/api/twitch/callback</code>
          </div>
          {isEdit && integration && (
            <div style={{ padding: '10px 12px', borderRadius: 8,
              background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                Twitch Account
              </div>
              {twitchStatus === null ? (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>
              ) : twitchStatus.connected ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>
                      Connected as <strong>{twitchStatus.userName}</strong>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>
                        @{twitchStatus.userLogin}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      Shows live streams from channels you follow.
                    </div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 11, flexShrink: 0 }}
                    disabled={twitchDisconnecting}
                    onClick={async () => {
                      setTwitchDisconnecting(true)
                      try {
                        await fetch(`/api/twitch/disconnect?integrationId=${integration.id}`, {
                          method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('stoa_token') ?? ''}` }
                        })
                        setTwitchStatus({ connected: false })
                      } finally { setTwitchDisconnecting(false) }
                    }}>
                    {twitchDisconnecting ? '…' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1 }}>
                    Not connected — authorize Stoa to read your followed streams.
                  </div>
                  <button className="btn btn-primary" style={{ fontSize: 11,
                      flexShrink: 0, background: '#9146FF', borderColor: '#9146FF' }}
                    onClick={() => { const t = localStorage.getItem('stoa_token') ?? ''; window.location.href = `/api/twitch/auth?integrationId=${integration.id}&token=${t}` }}>
                    Connect Twitch
                  </button>
                </div>
              )}
            </div>
          )}
          {!isEdit && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              After creating the integration, open it to connect your Twitch account via OAuth.
            </div>
          )}
        </div>
      ) : activeType === 'coinbase' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            API key: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>keyName:privateKey</code> (colon-separated) —
            both values from the JSON file Coinbase downloads when you create a CDP key at{' '}
            <a href="https://www.coinbase.com/settings/api" target="_blank" rel="noreferrer"
              style={{ color: 'var(--accent)' }}>coinbase.com/settings/api</a>. Choose Ed25519 when prompted (the default).
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            No URL needed — Stoa always calls api.coinbase.com. Read-only scopes are sufficient.
          </div>
        </div>
      ) : activeType === 'life360' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            No URL needed — Stoa always calls Life360's app API. API key: a session
            bearer token extracted by hand from your browser after logging into{' '}
            <a href="https://life360.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>life360.com</a>{' '}
            (DevTools → Application → Cookies → <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>LIFE360_AUTH_TOKEN</code>).
            It is not a stable credential — it can expire without warning, at which point you re-extract it and update the secret.
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            Add this integration as a source in a Map panel to see family locations.
          </div>
        </div>
      ) : activeType === 'rss' ? (
        <div>
          <label className="label">Feed URL</label>
          <input className="input" value={apiUrl}
            onChange={e => { setApiUrl(e.target.value); setTestResult(null) }}
            placeholder="https://example.com/feed.xml" />
        </div>
      ) : activeType === 'stocks' ? (
        <StocksConfigUI apiUrl={igConfig} onChange={setIgConfig} />
      ) : activeType === 'crypto' ? (
        <CryptoConfigUI apiUrl={igConfig} onChange={setIgConfig} />
      ) : activeType === 'sports' ? (
        <SportsConfigUI apiUrl={igConfig} onChange={setIgConfig} />
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="label">
              API URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(backend)</span>
            </label>
            <input className="input" value={apiUrl}
              onChange={e => { setApiUrl(e.target.value); setTestResult(null) }}
              placeholder="http://sonarr.local:8989" />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">
              UI URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(browser, optional)</span>
            </label>
            <input className="input" value={uiUrl}
              onChange={e => setUiUrl(e.target.value)}
              placeholder="https://sonarr.yourdomain.com" />
          </div>
        </div>
      )}

      {/* Credential format hint for types that use username:password in the secret field */}
      {(activeType === 'omv' || activeType === 'synology' || activeType === 'qnap' || activeType === 'photoprism' || activeType === 'qbittorrent' || activeType === 'rutorrent') && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          API key secret should contain <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>username:password</code>.
        </div>
      )}
      {/* Deluge uses a password only — no username */}
      {activeType === 'deluge' && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          API key secret should contain just the Deluge Web UI <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>password</code> (no username).
        </div>
      )}
      {/* NextDNS: non-obvious URL format */}
      {activeType === 'nextdns' && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          API URL format: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>https://api.nextdns.io/profiles/{'{'}<em>profileId</em>{'}'}</code>.
          Find your Profile ID in the NextDNS dashboard URL (or Settings → Profile ID).
          API key: bare token from nextdns.io → Account → API.
        </div>
      )}
      {/* Nginx Proxy Manager: email:password auth */}
      {activeType === 'nginxpm' && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          API key secret should contain <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>email:password</code> — your NPM web UI login credentials.
          Stoa exchanges these for a JWT session token automatically.
        </div>
      )}
      {/* wg-easy: password-only session auth */}
      {activeType === 'wgeasy' && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          API key secret is your wg-easy web UI password. Leave blank if your instance runs without a password.
          Stoa exchanges the password for a session cookie automatically.
        </div>
      )}
      {/* Tailscale: cloud API, bearer token */}
      {activeType === 'tailscale' && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          API key is a Tailscale API token (<code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>tskey-api-...</code>).
          Generate one at login.tailscale.com → Settings → Keys. Tokens expire in 1–90 days (you choose).
          Leave URL blank — Stoa always calls api.tailscale.com. Optionally enter your tailnet domain
          (e.g. <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>example.com</code>) if "-" does not resolve to your tailnet.
        </div>
      )}
      {/* Prometheus: local service, optional auth + custom metrics */}
      {activeType === 'prometheus' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            URL is your Prometheus base URL, e.g. <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>http://prometheus:9090</code>.
            Leave API key blank if Prometheus is open. For Basic Auth use <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>username:password</code>;
            for a Bearer token use a bare token string.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="label">
              Custom metrics{' '}
              <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional — target health &amp; alerts always shown)</span>
            </label>
            {promMetrics.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input className="input" value={m.label}
                  onChange={e => setPromMetrics(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                  placeholder="Label" style={{ width: 90, flexShrink: 0 }} />
                <input className="input" value={m.query}
                  onChange={e => setPromMetrics(prev => prev.map((x, j) => j === i ? { ...x, query: e.target.value } : x))}
                  placeholder="PromQL expression" style={{ flex: 1, fontFamily: 'DM Mono, monospace', fontSize: 12 }} />
                <input className="input" value={m.unit}
                  onChange={e => setPromMetrics(prev => prev.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))}
                  placeholder="Unit" style={{ width: 55, flexShrink: 0 }} />
                <button className="btn btn-ghost" style={{ fontSize: 14, padding: '0 8px', flexShrink: 0 }}
                  onClick={() => setPromMetrics(prev => prev.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            {promMetrics.length < 8 && (
              <button className="btn btn-secondary" style={{ fontSize: 12, alignSelf: 'flex-start' }}
                onClick={() => setPromMetrics(prev => [...prev, { label: '', query: '', unit: '' }])}>
                + Add metric
              </button>
            )}
            {promMetrics.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                Each metric shows as a stat card with a 1-hour sparkline. Examples —
                CPU: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>100 - avg(rate(node_cpu_seconds_total{'{'}mode="idle"{'}'}{`[5m]`}) * 100)</code>,
                Memory free: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>node_memory_MemAvailable_bytes</code>.
              </div>
            )}
          </div>
        </div>
      )}
      {/* Prowlarr: standard Servarr API key */}
      {activeType === 'prowlarr' && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          URL is your Prowlarr base URL, e.g. <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>http://prowlarr:9696</code>.
          API key is in Prowlarr → Settings → General → Security → API Key.
        </div>
      )}
      {/* Bazarr: API key */}
      {activeType === 'bazarr' && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          URL is your Bazarr base URL, e.g. <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>http://bazarr:6767</code>.
          Find your API key in Bazarr → Settings → General → Security → API Key.
        </div>
      )}
      {/* autobrr: API token */}
      {activeType === 'autobrr' && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          URL is your autobrr base URL, e.g. <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>http://autobrr:7474</code>.
          Find your API key in autobrr → Settings → API → Copy.
        </div>
      )}
      {/* Grafana: Service Account token */}
      {activeType === 'grafana' && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          URL is your Grafana base URL, e.g. <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>http://grafana:3000</code>.
          Create a Service Account under Administration → Service Accounts, then generate a token and paste it in the API key field.
          For datasource health checks and dashboard counts, the Service Account needs <strong>Viewer</strong> role minimum; for user counts (Admin Stats), it needs <strong>Admin</strong>.
        </div>
      )}

      {/* Test result */}
      {testResult && (
        <div style={{
          padding: '8px 12px', borderRadius: 7, fontSize: 12,
          background: testResult.ok ? '#4ade8018' : '#f8717118',
          border: `1px solid ${testResult.ok ? '#4ade8040' : '#f8717140'}`,
          color: testResult.ok ? 'var(--green)' : 'var(--red)',
        }}>
          {testResult.ok ? '✓ Connection successful' : `✗ ${testResult.error}`}
          {!testResult.ok && testResult.tlsError && testResult.skipTlsWorks && (
            <div style={{ marginTop: 4, color: 'var(--amber)', fontSize: 11 }}>
              ⚠ Connection works without certificate verification — enable "Skip TLS" below.
            </div>
          )}
        </div>
      )}

      {/* Options row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
          color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={skipTls} onChange={e => setSkipTls(e.target.checked)} />
          Skip TLS <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(self-signed certs)</span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Refresh every</label>
          <input className="input" type="number" min={15} value={refreshSecs}
            onChange={e => setRefreshSecs(Math.max(15, Number(e.target.value)))}
            style={{ width: 90 }} />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>s</span>
        </div>
        {CAL_WINDOWED_TYPES.includes(activeType) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}
              title="How far ahead this integration fetches and caches events when used as a calendar source. Calendar panels can only display up to this many days, never more.">
              Calendar days ahead
            </label>
            <select className="input" value={calDaysAhead}
              onChange={e => setCalDaysAhead(Number(e.target.value))}
              style={{ cursor: 'pointer', width: 90 }}>
              {CAL_DAYS_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
        )}
        {SEC_POSTURE_TYPES.includes(activeType) && SEC_POSTURE_CPE_TYPES.includes(activeType) && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 460, lineHeight: 1.5 }}>
            🛡 Security Posture matches this product's CVEs against your running version
            {detectedVersion ? <> (<code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{detectedVersion}</code>)</> : null} via
            NVD's structured version data — only CVEs that actually apply are shown, so there's no ignore-date to set.
          </div>
        )}
        {SEC_POSTURE_TYPES.includes(activeType) && !SEC_POSTURE_CPE_TYPES.includes(activeType) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}
                title="Security Posture will hide CVEs published before this date for this integration — a noise filter, not a claim about which versions are affected. Leave blank to show everything NVD has on file.">
                Ignore CVEs before
              </label>
              <input className="input" type="date" value={cveIgnoreBefore}
                onChange={e => setCveIgnoreBefore(e.target.value)}
                style={{ width: 150 }} />
              {cveIgnoreBefore && (
                <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }}
                  onClick={() => setCveIgnoreBefore('')}>
                  Clear
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 420, lineHeight: 1.5 }}>
              {detectedVersion
                ? <>Detected version: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{detectedVersion}</code>. This date auto-fills with today's date when an upgrade is detected — override it (e.g. with the real release date) if you want to keep older CVEs in view.</>
                : <>Auto-fills with today's date when a version change is detected. Override it manually to correlate against a real release date.</>}
            </div>
          </div>
        )}
      </div>

      {/* Group assignment slot — system scope, edit mode */}
      {children}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {!NO_TEST_TYPES.includes(activeType) && (
          <button className="btn btn-secondary" onClick={test}
            disabled={testing || (!apiUrl && !URL_OPTIONAL_TEST_TYPES.includes(activeType))}>
            {testing ? <span className="spinner" /> : 'Test'}
          </button>
        )}
        <button className="btn btn-primary" onClick={save}
          disabled={saving || !name.trim() || (!NO_URL_REQUIRED.includes(activeType) && !apiUrl)}>
          {saving ? <span className="spinner" /> : isEdit ? 'Save' : 'Create'}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        {isEdit && onDeleted && (
          <button className="btn btn-danger" style={{ marginLeft: 'auto' }}
            disabled={deleting} onClick={deleteIntegration}>
            {deleting ? <span className="spinner" /> : 'Delete'}
          </button>
        )}
      </div>
    </div>
  )
}
