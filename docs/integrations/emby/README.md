---
id: emby
name: Emby
category: Media Servers
tags: [movies, tv, streaming, self-hosted]
official_url: https://emby.media
status: tested
polling: 30s
secret_format: api-key
url_required: true
example_url: http://192.168.1.10:8096
---

# Emby

## What is Emby?

Emby is a media server that organizes and streams your movies, TV shows, music, and photos to apps across phones, tablets, TVs, and browsers. It sits between Plex and Jellyfin in philosophy — a polished product with a free tier plus an optional **Premiere** subscription that unlocks extras like hardware transcoding, mobile sync, and cover art. Core library management and streaming work without Premiere.

**Official site:** [emby.media](https://emby.media)

---

## Getting the key

Emby → **Settings → Advanced → API Keys → New API Key**. Give it any name (e.g. `stoa`) and copy the generated key.

- **Secret format:** plain API key
- **URL:** required — point at your Emby server port, e.g. `http://192.168.1.10:8096`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the API key.
2. **Admin → Integrations → New** — select **Emby**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Emby**.

---

## Panel

Active stream monitor showing what each user is watching, with transcode vs. direct-play status, playback progress, and library size breakdown. Server version is shown at the top.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Active stream count + currently playing title |
| 2–3x | Stream list with user, title, progress bars, and transcode indicator + library counts |
| 4x+ | Full stream detail (client, quality, transcode vs. direct play) + library breakdown by type + server version |

### How data flows

On each 30-second poll cycle the backend calls Emby's `/Sessions` and `/Library/MediaFolders` endpoints. The session list and library stats are stored in the backend cache keyed by integration ID — the browser never calls Emby directly.

The panel subscribes to **Server-Sent Events (SSE)**. When the worker refreshes the cache, it broadcasts a `cache-update` event on the integration's SSE channel. The panel receives this signal and updates immediately without a page reload. **Refresh Now** (right-click the panel title bar) triggers an out-of-cycle fetch that pushes fresh data through the same SSE path.

### Screenshots

| | Light | Dark |
|---|---|---|
| **1x** | ![1x light](./screenshots/1x-light.png) | ![1x dark](./screenshots/1x-dark.png) |
| **2x** | ![2x light](./screenshots/2x-light.png) | ![2x dark](./screenshots/2x-dark.png) |
| **4x** | ![4x light](./screenshots/4x-light.png) | ![4x dark](./screenshots/4x-dark.png) |

---

## Ratings filter

Set **Allowed ratings** in the panel config (e.g. `G, PG, PG-13, TV-PG`) to hide now-playing sessions for content outside the list — useful on family-shared dashboards. Unrated content is hidden when a filter is active. Matches the item's official rating string as reported by the server.

---

## Notes

- The Emby API key grants read-only access to sessions and library metadata.
- Emby Premiere is not required for API access.
