---
id: photoprism
name: PhotoPrism
category: Media Servers
tags: [photos, self-hosted]
official_url: https://www.photoprism.app
status: tested
polling: 30min
secret_format: username-password
url_required: true
example_url: http://192.168.1.10:2342
---

# PhotoPrism

## What is PhotoPrism?

PhotoPrism is a self-hosted, AI-powered photo management app for browsing, organizing, and sharing large personal photo collections. It automatically tags photos by content, recognizes faces, maps geotagged shots, and groups them into moments — running entirely on your own server with no cloud dependency.

**Official site:** [photoprism.app](https://www.photoprism.app)

---

## Getting the key

Use your PhotoPrism login credentials in `username:password` form (e.g. `admin:yourpassword`). If your instance runs with no password, leave the secret blank.

- **Secret format:** `username:password` (or blank for a public instance)
- **URL:** required — point at your PhotoPrism port, e.g. `http://192.168.1.10:2342`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the `username:password` credential (or leave blank).
2. **Admin → Integrations → New** — select **PhotoPrism**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **PhotoPrism**.

---

## Panel

Library stats pulled from PhotoPrism's config endpoint, plus a photo preview carousel that cycles through random thumbnails cached daily.

### What's shown

- **Stat tiles** — photos · videos · albums · folders · moments · people · places · labels; only non-zero values appear, so the grid is naturally sized to your library
- **Photo carousel** (4x+) — up to 6 random photos fetched from your library and cached for 24 hours; advances every 4 seconds, pauses on hover, navigable via dot indicators

### Height behavior

| Height | What you see |
|---|---|
| 1x | Up to 4 of the best non-zero stat tiles inline (photos first, then folders, labels, albums, etc.) |
| 2–3x | Full stat grid — all non-zero tiles, wrapping |
| 4x+ | Photo carousel (top) + stat grid (bottom) |

### Screenshots

| | Light | Dark |
|---|---|---|
| **1x** | ![1x light](./screenshots/1x-light.png) | ![1x dark](./screenshots/1x-dark.png) |
| **2x** | ![2x light](./screenshots/2x-light.png) | ![2x dark](./screenshots/2x-dark.png) |
| **4x** | ![4x light](./screenshots/4x-light.png) | ![4x dark](./screenshots/4x-dark.png) |

---

## Notes

- **All stats in one call:** PhotoPrism exposes library counts inside its `/api/v1/config` endpoint — a single request returns photos, videos, albums, folders, moments, people, places, and labels simultaneously
- **Sparse grids:** If your library hasn't been fully indexed (no face recognition, no geo-tagging, no albums created), tiles for people, places, and albums simply won't appear. Run PhotoPrism's indexing pass to populate them
- **Photo carousel:** Thumbnails are fetched via PhotoPrism's tile API using a preview token obtained at login. The token is cached for the session; if it expires, Stoa re-authenticates automatically on the next poll
- **Carousel pre-loading:** All 6 thumbnails are fetched when the panel first expands, stored as in-memory object URLs, and revoked on unmount — no network calls while the slideshow cycles
- **Photo cache:** The random selection is cached for 24 hours per integration. Use the panel's right-click → Refresh to pick a new random set immediately
- **Polling and SSE:** Stoa polls PhotoPrism every 30 minutes. Results are pushed to all connected browsers via SSE — no manual refresh needed
- **API calls per poll:** `/api/v1/session` (login, cached), `/api/v1/config` (all stats + preview token), `/api/v1/photos?order=random` (preview photos, 24h cached)
- **Public instances:** If your PhotoPrism instance has no password set, leave the secret field blank. Stoa will skip authentication and use the public API directly
