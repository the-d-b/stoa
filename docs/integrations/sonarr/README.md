---
id: sonarr
name: Sonarr
category: Media Management
tags: [tv, automation, arr, self-hosted]
official_url: https://sonarr.tv
status: tested
polling: 30min
secret_format: api-key
url_required: true
example_url: http://192.168.1.10:8989
---

# Sonarr

## What is Sonarr?

Sonarr is a PVR (personal video recorder) for TV series in the "\*arr" family. It monitors the shows you follow, automatically grabs new episodes the moment a matching release appears on your configured usenet and torrent indexers, hands them to your download client, then renames and files the results into your library with correct season/episode structure and artwork.

**Official site:** [sonarr.tv](https://sonarr.tv)

---

## Getting the key

Sonarr → **Settings → General → Security → API Key** — copy it.

- **Secret format:** plain API key
- **URL:** required — point at your Sonarr port, e.g. `http://192.168.1.10:8989`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the API key.
2. **Admin → Integrations → New** — select **Sonarr**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Sonarr**.

---

## Panel

Series library overview with upcoming episode schedule, recently downloaded episodes, missing-on-disk count with a sample list, and library stats (series / episodes / on disk).

### Height behavior

| Height | What you see |
|---|---|
| 1x | Stat chips: series count · episode count · on disk count |
| 2x | Stat chips + recently downloaded episodes (grouped by series) |
| 3x | + Missing on disk — random sample of series with no episode files |
| 4x+ | Poster artwork filmstrip + stat chips + recently downloaded + missing on disk |

### Artwork filmstrip (4x+)

The 4x filmstrip displays poster artwork for recently downloaded or upcoming episodes. If no downloads or upcoming air dates are available (e.g. a fresh setup or manual-import-only environment), the filmstrip falls back to artwork for series that have no episode files on disk — giving a visual "want list." Posters are fetched from Sonarr through Stoa's **image proxy** (`/api/images/proxy`), so your Sonarr instance does not need to be publicly accessible.

### Content rating filter

An optional `allowedRatings` config field accepts a comma-separated list of content ratings (e.g. `TV-G,TV-PG,TV-14`). When set, only series whose Sonarr rating matches the list appear in the filmstrip and missing-on-disk sections — useful for shared family dashboards.

### How data flows

On each 30-minute poll cycle the backend calls:

| Endpoint | Data retrieved |
|---|---|
| `GET /api/v3/calendar` | Upcoming episodes (90-day window) with series poster URLs |
| `GET /api/v3/history` | Recently grabbed/imported episodes with series poster URLs |
| `GET /api/v3/series` | Full library — series counts, episode file counts, poster URLs |

All data is stored in the backend cache keyed by integration ID. The browser never calls Sonarr directly, and poster artwork is served through Stoa's image proxy — Sonarr's internal URLs are never exposed to the browser.

The panel subscribes to **Server-Sent Events (SSE)**. When the worker refreshes the cache, it broadcasts a `cache-update` event on the integration's SSE channel. The panel updates automatically without a page reload.

### Screenshots

| | Light | Dark |
|---|---|---|
| **1x** | ![1x light](./screenshots/1x-light.png) | ![1x dark](./screenshots/1x-dark.png) |
| **2x** | ![2x light](./screenshots/2x-light.png) | ![2x dark](./screenshots/2x-dark.png) |
| **4x** | ![4x light](./screenshots/4x-light.png) | ![4x dark](./screenshots/4x-dark.png) |

---

## Notes

**Calendar:** Sonarr episode air dates appear on the Calendar panel. Add Sonarr as a calendar source in Profile → Calendar Sources.

**Missing-on-disk sample:** The 3x/4x missing list shows a random 8-series sample that re-shuffles on each data refresh, giving a rotating view of your wanted library without scrolling through everything.
