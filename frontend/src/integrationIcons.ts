// Static icon set for panel title bars — sourced once from the dashboard-icons
// project (Apache 2.0, see public/integration-icons/NOTICE.md) and shipped as
// static files, not fetched/cached at runtime. Only types with a clean 1:1
// integration mapping get an icon; panel types with no single backing
// integration (calendar, kanban, checklist, notes, etc.) are intentionally
// absent and render no icon.

// Types whose icon file is .png rather than the default .svg
const PNG_TYPES = new Set(['blueiris', 'lubelogger', 'mylar3', 'tdarr'])

// Types with a bundled icon file. Kept explicit (rather than "try and let
// onError hide it") so panel types without coverage never issue a request.
const ICON_TYPES = new Set([
  'actualbudget', 'adguard', 'audiobookshelf', 'authentik', 'autobrr', 'bazarr',
  'blueiris', 'cloudflare', 'deluge', 'docspell', 'duolingo', 'emby', 'fireflyiii',
  'fittrackee', 'frigate', 'ghostfolio', 'github', 'gluetun', 'grafana', 'grocy',
  'homeassistant', 'homebox', 'immich', 'jellyfin', 'jellystat', 'kapowarr',
  'kavita', 'komga', 'kuma', 'lidarr', 'lubelogger', 'maintainerr', 'mealie',
  'monica', 'mylar3', 'navidrome', 'netbird', 'nextcloud', 'nextdns', 'nginxpm',
  'nzbget', 'omada', 'omv', 'openwrt', 'opnsense', 'overseerr', 'paperless',
  'pfsense', 'photoprism', 'pihole', 'plex', 'prometheus', 'prowlarr', 'proxmox',
  'pterodactyl', 'qbittorrent', 'qnap', 'radarr', 'readarr', 'romm', 'rutorrent',
  'sabnzbd', 'scrutiny', 'sonarr', 'spotify', 'steam', 'strava', 'synology',
  'tailscale', 'tandoor', 'tautulli', 'tdarr', 'tracearr', 'traefik', 'trakt',
  'transmission', 'truenas', 'twitch', 'unifi', 'unraid', 'wgeasy', 'wger',
  'youtube',
])

export function integrationIconUrl(type: string | undefined | null): string | null {
  if (!type || !ICON_TYPES.has(type)) return null
  const ext = PNG_TYPES.has(type) ? 'png' : 'svg'
  return `/integration-icons/${type}.${ext}`
}
