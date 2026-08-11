// Static icon set for panel title bars — shipped as static files, not fetched
// or cached at runtime. Sourced from three places (see
// public/integration-icons/NOTICE.md): dashboard-icons for real self-hosted
// app/service brands, simple-icons for the handful of real brands
// dashboard-icons doesn't carry (Coinbase, Last.fm), and Lucide (recolored
// to a fixed neutral gray, since these are generic concepts with no brand
// color) for panel types with no backing app at all — calendar, notes,
// checklist, and similar.

// Types whose icon file is .png rather than the default .svg
const PNG_TYPES = new Set(['blueiris', 'lubelogger', 'mylar3', 'tdarr', 'tranga'])

// Types with a bundled icon file. Kept explicit (rather than "try and let
// onError hide it") so panel types without coverage never issue a request.
const ICON_TYPES = new Set([
  'actualbudget', 'adguard', 'audiobookshelf', 'authentik', 'autobrr', 'bazarr',
  'blueiris', 'bookmarks', 'calendar', 'checklist', 'cloudflare', 'coinbase',
  'crypto', 'custom', 'customapi', 'deluge', 'dockerapps', 'docspell',
  'duolingo', 'emby', 'fireflyiii', 'fittrackee', 'frigate', 'ghostfolio',
  'github', 'gluetun', 'grafana', 'grocy', 'homeassistant', 'homebox',
  'iframe', 'immich', 'jellyfin', 'jellystat', 'kanban', 'kapowarr', 'kavita',
  'keycloak', 'komga', 'kuma', 'lastfm', 'lidarr', 'lubelogger', 'maintainerr', 'map', 'mealie',
  'monica', 'mylar3', 'navidrome', 'netbird', 'nextcloud', 'nextdns', 'nginxpm',
  'notes', 'nzbget', 'omada', 'omv', 'openwrt', 'opnsense', 'overseerr',
  'paperless', 'pfsense', 'photoprism', 'pihole', 'plex', 'plexmusic', 'prometheus',
  'prowlarr', 'proxmox', 'pterodactyl', 'qbittorrent', 'qnap', 'radarr',
  'readarr', 'romm', 'rss', 'rutorrent', 'sabnzbd', 'scrutiny', 'search',
  'securityposture', 'sonarr', 'sports', 'spotify', 'steam', 'stocks',
  'strava', 'synology', 'tailscale', 'tandoor', 'tautulli', 'tdarr',
  'tmdb', 'tracearr', 'traefik', 'trakt', 'tranga', 'transmission', 'truenas', 'twitch',
  'unifi', 'unraid', 'weather', 'wgeasy', 'wger', 'youtube',
])

export function integrationIconUrl(type: string | undefined | null): string | null {
  if (!type || !ICON_TYPES.has(type)) return null
  const ext = PNG_TYPES.has(type) ? 'png' : 'svg'
  return `/integration-icons/${type}.${ext}`
}
