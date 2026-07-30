---
id: maintainerr
name: Maintainerr
category: Media Management
tags: [cleanup, automation, plex, self-hosted]
official_url: https://maintainerr.info
status: tested
polling: 5min
secret_format: api-key
url_required: true
example_url: http://192.168.1.10:6246
---

# Maintainerr

## What is Maintainerr?

Maintainerr is a self-hosted media-management tool that automatically cleans up your Plex library based on rules you define — never-watched movies, shows not played in years, and so on. Rules build collections; items that meet the criteria and have aged past your delete-after window are removed automatically from Plex (and optionally unmonitored or deleted from Radarr/Sonarr).

**Official site:** [maintainerr.info](https://maintainerr.info)

---

## Getting the key

Most Maintainerr instances run without authentication — leave the secret blank. If you've put it behind auth, paste your API token (or `username:password` for reverse-proxy Basic Auth).

- **Secret format:** blank (no auth), Bearer token, or `username:password`
- **URL:** required — point at your Maintainerr port, e.g. `http://192.168.1.10:6246`

---

## Add it to Stoa

1. **Admin → Secrets → New** — leave blank, or paste your Maintainerr token.
2. **Admin → Integrations → New** — select **Maintainerr**, enter the URL, choose the secret (or none).
3. **Admin → Panels → New** — select **Maintainerr**.

---

## Panel

Collection cards showing what's queued for deletion — with poster filmstrips, type badges, item counts, delete-after windows, and lifetime cleanup stats.

### What's shown

- **Stat chips (4x)** — total rules, items queued across all collections, reclaimable disk space, and lifetime items cleaned up
- **Header bar (2x)** — active rule count, total queued items, reclaimable bytes
- **Stat tiles (1x)** — bordered tiles for active count, queued, and reclaimable — consistent with other panels
- **Collection cards (4x)** — one card per collection with:
  - Type badge (Movies / Shows / Seasons / Episodes) color-coded by media type
  - Title, item count, delete-after window, arr action (Delete / Unmonitor + Delete / Unmonitor), collection size
  - Poster filmstrip from TMDB artwork for the items queued in that collection
  - Paused collections shown at reduced opacity with a "paused" label
- **Collection rows (2x)** — compact list with type badge, title, pause state, and item count

### Height behavior

| Height | What you see |
|---|---|
| 1x | Bordered stat tiles — active rules · queued · reclaimable |
| 2–3x | Stat tiles header + scrollable collection row list |
| 4x+ | Stat chips + full collection cards with poster filmstrips |

### Screenshots

| | Light | Dark |
|---|---|---|
| **1x** | ![1x light](./screenshots/1x-light.png) | ![1x dark](./screenshots/1x-dark.png) |
| **2x** | ![2x light](./screenshots/2x-light.png) | ![2x dark](./screenshots/2x-dark.png) |
| **4x** | ![4x light](./screenshots/4x-light.png) | ![4x dark](./screenshots/4x-dark.png) |

---

## Calendar

Add Maintainerr as a calendar source (Profile/Admin → Calendar panel → Calendar sources → **Stoa integration**) to see upcoming scheduled cleanup actions on the calendar, aggregated per collection per day — e.g. `Old Movies: 3 items (Delete)`. Events click through to the collection's page in Maintainerr. Uses the same `/api/collections/overlay-data` endpoint and date math as Maintainerr's own calendar page; results are cached for 15 minutes. See [Calendar](../calendar/README.md#maintainerr) for details.

---

## Notes

- **Polling and SSE:** Stoa polls Maintainerr every 5 minutes. Results are cached and pushed to all connected browsers via SSE — no manual refresh needed
- **API calls per poll:** 1 call to `/api/collections` for collection metadata, then 1 call per collection (up to 300 items) to `/api/collections/media/{id}/content/1` for poster images — typically 3–6 calls total depending on how many collections you have. Collections larger than 300 items skip the poster call entirely — that endpoint sorts the whole collection before paginating, so on very large collections it gets slow enough to back up subsequent polls
- **Poster images:** Fetched from the content endpoint rather than the collections list — the collections list returns `image_path: null` for TV shows; the content endpoint returns populated TMDB poster URLs for both movies and shows
- **Show size bytes:** Maintainerr tracks `totalSizeBytes` accurately for movie collections (sourced from Radarr) but stores a nominal internal record size for TV show collections — the reclaimable figure is reliable for movies and near-zero/inaccurate for shows. This is a Maintainerr behavior, not a Stoa limitation
- **Reclaimable vs Freed:** The 4x panel shows reclaimable space when collections have queued items. Once items are deleted and `reclaimableBytes` drops to zero, it switches to showing lifetime bytes freed from the storage-metrics endpoint
- **Lifetime stats:** Cleaned-up item count and bytes freed come from Maintainerr's `/api/storage-metrics` endpoint and reflect all-time activity, not a sliding window
- **Authentication:** Maintainerr supports no auth, Basic auth (`username:password`), or Bearer token. Stoa detects the colon pattern automatically — if the secret contains a colon it sends Basic auth, otherwise Bearer
- **API endpoints used:** `/api/health` (connection test), `/api/collections`, `/api/collections/media/{id}/content/1?size=25`, `/api/storage-metrics`
