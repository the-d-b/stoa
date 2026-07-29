---
id: tranga
name: Tranga
category: Print Media
tags: [manga, downloads, self-hosted]
official_url: https://github.com/C9Glax/tranga
status: tested
polling: 30min
secret_format: none
url_required: true
example_url: http://tranga:9898
---

# Tranga

## What is Tranga?

Tranga is a self-hosted manga downloader. It monitors manga series across supported sources, automatically downloads new chapters, and organizes your library with covers and publication status.

**Official site:** [github.com/C9Glax/tranga](https://github.com/C9Glax/tranga)

---

## Getting the key

None by default — Tranga runs unauthenticated. Leave the secret blank. If you've configured an API key in Tranga (optional), paste it.

- **Secret format:** none (or an optional API key)
- **URL:** required — point at your Tranga port, e.g. `http://tranga:9898`

---

## Add it to Stoa

1. **Admin → Integrations → New** — select **Tranga**, enter the URL, leave the secret blank (or paste your key).
2. **Admin → Panels → New** — select **Tranga**.

---

## Panel

Manga downloader showing your library with publication status, active chapter downloads, and scrollable cover filmstrips for both library and currently downloading manga.

### What's shown

- **Stats** — manga count · active download count
- **Library filmstrip** (2x+) — scrollable cover strip of all manga in your library
- **Downloading filmstrip** (4x+) — cover strip of manga currently being downloaded; only shown when active downloads exist
- **Lists** (4x+) — library list with publication status (Ongoing / Completed / Hiatus / Cancelled) and active downloads column side by side

### Height behavior

| Height | What you see |
|---|---|
| 1x | Manga count · downloading count centered with panel icon |
| 2–3x | Stats + scrollable library cover filmstrip |
| 4x+ | Library filmstrip + downloading filmstrip (if active) + library list + downloading list |

### Screenshots

| | Light | Dark |
|---|---|---|
| **1x** | ![1x light](./screenshots/1x-light.png) | ![1x dark](./screenshots/1x-dark.png) |
| **2x** | ![2x light](./screenshots/2x-light.png) | ![2x dark](./screenshots/2x-dark.png) |
| **4x** | ![4x light](./screenshots/4x-light.png) | ![4x dark](./screenshots/4x-dark.png) |

---

## Notes

- **Auth:** Tranga has no authentication by default. If an API key is set, it is sent as the `X-API-Key` header
- **Manga IDs:** Tranga uses composite keys (e.g. `Manga-{hash}`) that may contain characters unsafe in URL paths. Cover requests use a query parameter (`?id=...`) with `url.PathEscape` so all ID formats are handled safely
- **Cover proxy:** Manga covers are fetched server-side by Stoa via `/v2/Manga/{id}/Cover/Small` and cached in the browser for 24 hours — the browser never contacts Tranga directly; only the Stoa server needs network access to it
- **Publication status colours:** Ongoing → green; Completed and unknown → dim; Hiatus and Cancelled → red
- **Polling and SSE:** Stoa polls Tranga every 30 minutes. Results are cached and pushed to all connected browsers via SSE — no manual refresh needed
- **API calls per poll:** `GET /v2/Manga` (full manga library with status), `GET /v2/Manga/Downloading` (actively downloading manga)
