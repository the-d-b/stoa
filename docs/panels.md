# Panels

Panels are the widgets on your dashboard. Each panel shows data from one source and occupies a configurable amount of vertical space.

---

## Panels and integrations

Most panels are backed by an **integration** — a configured connection to a service. The integration holds the URL and credentials; the panel holds the display configuration and references the integration by ID.

A few panel types are **standalone**: they don't require a backend integration because they either use no external data, or they call public APIs directly without credentials.

| Panel type | Requires integration? |
|---|---|
| Sonarr | Yes |
| Radarr | Yes |
| Lidarr | Yes |
| Readarr | Yes |
| Plex | Yes |
| Tautulli | Yes |
| TrueNAS | Yes |
| Unraid | Yes |
| OpenMediaVault | Yes |
| Synology DSM | Yes |
| QNAP QTS | Yes |
| Proxmox | Yes |
| OPNsense | Yes |
| Uptime Kuma | Yes |
| Gluetun | Yes |
| Transmission | Yes |
| qBittorrent | Yes |
| Deluge | Yes |
| ruTorrent | Yes |
| PhotoPrism | Yes |
| Authentik | Yes |
| Jellyfin | Yes |
| Home Assistant | Yes |
| Overseerr / Jellyseerr | Yes |
| Steam | Yes |
| Calendar | Yes (one or more — Sonarr/Radarr/Lidarr/Readarr/Google Calendar) |
| RSS / Atom | Yes |
| Custom API | Yes |
| Text/HTML | No — content is written directly in the panel config |
| Web Embed | No — renders any URL in an iframe |
| Weather | No — public API, no credentials |
| Sports | No — ESPN public API |
| Stocks | No — Yahoo Finance public data |
| Crypto | No — CoinGecko public API (optional API key for higher rate limits) |
| Notes | No — local to Stoa |
| Checklist | No — local to Stoa |
| Bookmarks | No — local to Stoa |
| Search | No — passes queries to your search engine of choice |

---

## Panel types

### Sonarr
Upcoming episode schedule, recently downloaded episodes, wanted/missing episodes, series and episode counts. See [integrations.md](integrations.md#sonarr).

### Radarr
Upcoming movie releases, recently downloaded movies, wanted/missing movies, movie count. See [integrations.md](integrations.md#radarr).

### Lidarr
Upcoming album releases, recently downloaded albums, wanted/missing albums, artist and track counts. See [integrations.md](integrations.md#lidarr).

### Readarr
Upcoming book and audiobook releases, recently added titles, missing books, counts. See [integrations.md](integrations.md#readarr).

### Plex
Active streams with user, title, and progress. Library counts. Update availability indicator. See [integrations.md](integrations.md#plex).

### Tautulli
Current streams, most played content, recently played history, user statistics. See [integrations.md](integrations.md#tautulli).

### TrueNAS
CPU, RAM, ARC, disk I/O, network throughput, pool health, disk temperatures, alerts, VMs, apps. Uses a persistent WebSocket connection — data updates every ~2 seconds. See [integrations.md](integrations.md#truenas).

### Unraid
CPU usage (per-core and aggregate), memory usage, network throughput, array disk temperatures, running VMs and Docker containers. Uses a persistent WebSocket connection for live data. See [integrations.md](integrations.md#unraid).

**Height:** 2× shows host stats and network. 4× adds disk temperature rows and container counts. 8× adds full per-core CPU breakdown and container details.

### OpenMediaVault (OMV)
CPU usage, memory usage, per-interface network throughput, filesystem usage, disk temperatures and SMART status. See [integrations.md](integrations.md#openmedivault-omv).

**Height:** 1× shows compact stats only. 2–3× adds network and filesystem rows. 4×+ adds full disk table.

### Synology DSM
CPU usage, memory usage, per-interface network throughput, volume health and capacity, disk temperatures and SMART status, shared folder list. Displays hostname, model, DSM version, and uptime. See [integrations.md](integrations.md#synology-dsm).

**Height:** 1× shows compact arcs only. 2–3× adds network widget, volume rows, disk temperatures (compact), and shares. 4×+ adds full disk table and per-interface network breakdown.

**Status indicators:** Degraded volumes display an amber warning badge. Failed or problem disks display a red error badge. Both appear in the panel header at any height.

### QNAP QTS
CPU usage, memory usage, aggregate network throughput, volume health and capacity, disk temperatures and SMART status, shared folder list. Displays hostname, model, firmware version (QTS x.x.x), and uptime. See [integrations.md](integrations.md#qnap-qts).

**Height:** 1× shows compact arcs only. 2–3× adds disk temperature rows (with SMART status indicator) and shares pill. 4×+ adds full disk table with model, size, and SMART detail.

**Status indicators:** Degraded volumes display an amber warning badge. Disks with non-passing SMART status display a warning badge. Both appear in the panel header at any height.

### Proxmox
Node CPU and memory, storage, running VMs and containers, cluster overview. See [integrations.md](integrations.md#proxmox).

### OPNsense
Interface traffic rates (live SSE stream), firewall event donut, top WAN talkers, DNS stats, PF states, firmware version. See [integrations.md](integrations.md#opnsense).

### Uptime Kuma
Monitor status (up/down/pending), response times, uptime percentages, incident history. See [integrations.md](integrations.md#uptime-kuma).

### Gluetun
VPN status, current IP address and location, WireGuard/OpenVPN mode. See [integrations.md](integrations.md#gluetun).

### Transmission
Active downloads with progress and speed, seeding count, total upload/download stats. See [integrations.md](integrations.md#transmission).

**Height behavior:** 1 unit = speed + status counts; 2 units = + active torrent list with progress bars; 4 units = + tracker breakdown.

### qBittorrent
Active downloads with progress and speed, seeding count, free disk space, tracker breakdown. See [integrations.md](integrations.md#qbittorrent).

**Height behavior:** 1 unit = speed + status counts; 2 units = + active torrent list with progress bars; 4 units = + tracker breakdown.

### Deluge
Active downloads with progress and speed, seeding count, free disk space, tracker breakdown. See [integrations.md](integrations.md#deluge).

**Height behavior:** 1 unit = speed + status counts; 2 units = + active torrent list with progress bars; 4 units = + tracker breakdown.

### ruTorrent
Active downloads with progress and speed, seeding count, free disk space. Tracker breakdown shown when the httprpc plugin's `mode=trkl` is available. See [integrations.md](integrations.md#rutorrent).

**Height behavior:** 1 unit = speed + status counts; 2 units = + active torrent list with progress bars; 4 units = + tracker breakdown.

### PhotoPrism
Photo and video counts, library size, recent imports, indexing status. Photo preview carousel (random thumbnails, refreshed daily). See [integrations.md](integrations.md#photoprism).

### Authentik
Login counts, failed login attempts, recent failure details, active sessions. See [integrations.md](integrations.md#authentik).

### Jellyfin
Active streams with user, title, progress, and transcode vs. direct play status. Library counts. Server name and version. See [integrations.md](integrations.md#jellyfin).

### Home Assistant
Entity states for smart home devices. Filter by entity ID or domain (`sensor`, `light`, `switch`, etc.). Shows friendly name, state, unit, and last-changed time. See [integrations.md](integrations.md#home-assistant).

### Overseerr / Jellyseerr
Request counts by status, movie vs. TV breakdown, recent pending requests. See [integrations.md](integrations.md#overseerr--jellyseerr).

### Steam
Player profile (online state, current game), owned game count and total hours, top games by playtime, recently played, recent achievement unlocks, Steam store sales and new releases. See [integrations.md](integrations.md#steam).

### Calendar
Multi-source calendar aggregating upcoming events from any combination of Sonarr, Radarr, Lidarr, Readarr, and Google Calendar.

**Multi-source:** Each calendar panel can pull from multiple integrations simultaneously. Add sources in Profile → Integrations → Calendar Sources. Each source has its own days-ahead window (7–90 days). The panel merges and displays all events in a single view.

**Filtering:** Sources can be individually shown or hidden within a panel. This lets you toggle media releases vs. personal appointments without reconfiguring the panel.

### RSS / Atom
Items from any RSS or Atom feed — title, summary, and link. The feed URL is configured per panel (not per integration), so a single RSS integration can back multiple panels pointing to different feeds.

### Custom API
A generic panel that makes a GET request to any URL and displays the JSON response as formatted text. Useful for services not natively supported in Stoa, simple status endpoints, or custom scripts that expose JSON.

The integration URL is the endpoint to call. An optional Bearer token can be stored as a secret.

### Text/HTML
A freeform panel that renders arbitrary HTML content. Write anything directly into the panel config — no integration or external service needed.

**No integration required:** Create a Text/HTML panel and paste your HTML into the content field.

Useful for static content, custom layouts, or embedding images from a direct URL. To display an image sized to fit the panel:

```html
<img src="https://example.com/photo.jpg"
     style="width:100%;height:100%;object-fit:contain;display:block;">
```

`object-fit: contain` scales the image down to fit the panel while preserving its aspect ratio. Use `object-fit: cover` instead to fill the panel completely, cropping the edges.

### Web Embed
Renders any URL inside an iframe that fills the panel. Useful for embedding web pages, dashboards, or other live content.

**No integration required:** Create a Web Embed panel and enter the URL to embed.

Note: loading a direct image URL (e.g. a `.jpg`) in a Web Embed panel will display the image at its native size with scrollbars, since the browser's built-in image viewer has no awareness of the panel's dimensions. Use a **Text/HTML** panel with an `<img>` tag instead when you want an image to resize to fit.

### Weather
Current conditions (temperature, feels-like, wind, humidity) and a multi-day forecast. Sourced from [Open-Meteo](https://open-meteo.com) — no API key required.

**Standalone:** Create a Weather panel and configure your location directly in the panel config. No integration needed.

Configure your location by city name (e.g. `Denver, CO`) or latitude/longitude. Temperature unit (°F/°C) is set per panel.

### Sports
Scores, standings, and schedules for NHL, NFL, NBA, and MLB from ESPN's public API.

**Standalone:** Create a Sports integration (no URL or secret needed), then create a panel. In the panel config, select the sport and league(s) to display.

### Stocks
US stock quotes with mini sparklines for recent price movement, sourced from Yahoo Finance.

**Standalone:** Create a Stocks panel and enter the ticker symbols you want to track (e.g. `AAPL`, `MSFT`, `NVDA`).

### Crypto
Cryptocurrency prices with sparklines, sourced from CoinGecko.

**Standalone (mostly):** The public CoinGecko API works without a key but has strict rate limits. For reliable use, create a free Demo API key at coingecko.com and store it as a secret on the integration.

### Notes
A shared markdown-capable note panel. Notes are stored in Stoa — no external service needed.

**Multi-user locking:** Only one user can edit a note at a time. When someone opens a note for editing, it locks for other users until the editor saves or discards changes. Other users see the note as read-only while it's locked and can see who holds the lock.

**Personal vs. system:** Admins create system note panels shared with groups. Users can also create personal note panels visible only to them.

### Checklist
A shared checklist panel. Items can be checked off, added, or removed. The checklist state is shared — when one user checks an item, it's checked for everyone who can see the panel.

**No integration required:** Checklist panels are standalone. Create one directly from Admin → Panels.

### Bookmarks
A visual bookmark tree displayed as a panel on the dashboard. Bookmarks are organized into folders and sub-folders, each optionally with a custom icon. Clicking a bookmark opens the URL.

**No integration required:** Bookmarks are stored in Stoa. Manage the bookmark tree in Admin → Bookmarks.

**Node path:** Bookmark items in the tree are identified by their path — a `/`-separated hierarchy matching the folder structure (e.g. `Media/Plex`). This path is used for CLI import/export and the internal tree API.

**Scope:** System bookmarks (created by admins) are shared with groups. Personal bookmarks visible only to the creator can be added from the profile.

### Search
A search bar panel that passes queries to a configured search engine. Supports any search engine with a URL pattern, including self-hosted options like SearXNG.

**No integration required:** Configure the search engine URL pattern directly in the panel config.

---

## Panel height

Each panel has a height setting that controls how much vertical space it occupies:

| Height | Approximate size | Good for |
|---|---|---|
| 1× | ~134px | Compact single-stat panels, search bar |
| 2× | ~268px | Standard panels with a few rows of data |
| 4× | ~536px | Data-rich panels (TrueNAS, OPNsense, Sonarr) |
| 8× | ~1072px | Very tall panels (calendar, full entity lists) |

The exact pixel height depends on the layout mode. Dynamic height mode lets panels grow beyond their configured height to fit content — see [layouts.md](layouts.md#dynamic-panel-height).

---

## System panels vs. personal panels

**System panels** are created by admins. They are shared with groups — every member of the group sees the panel. Group membership controls who can see it; tags control whether it appears in the current view.

**Personal panels** are created by users from their own profile. Only the creator sees them. Personal panels can be any type and can reference personal integrations (using secrets only the user can access).

Both types appear in the same panel grid, interleaved by panel order.
