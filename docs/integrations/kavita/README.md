# Kavita

**Category:** Photos & Libraries | **Status:** Tested | **Polling:** 30 min

---

## Integration

**Secret format:** Plain API key

> Kavita → your username (top-right) → User Settings → API Key (any account works — admin not required)

**URL required:** Required

**Example URL:** `http://192.168.1.10:5000`

### Setup

1. Kavita → your username (top-right) → User Settings → copy API Key
2. Stoa → Admin → Secrets → New: paste the key
3. Stoa → Admin → Integrations → New: select **Kavita**, enter URL and secret
4. Stoa → Admin → Panels → New: select **Kavita**

---

## Panel

Library reader showing series counts, per-library scrollable cover filmstrips, and a recently-added list grouped by library.

### What's shown

- **Stats** — series count · library count
- **Cover filmstrip** (2x+) — scrollable strip of recently added series; hover left/right edge to scroll
- **Per-library filmstrips** (4x+) — one strip per library, each labelled, drawn from the 30 most recently added series
- **Recently added list** (4x+) — recently added series grouped by library with sticky group headers, top 5 per library

### Height behavior

| Height | What you see |
|---|---|
| 1x | Series · library · file counts centered with panel icon |
| 2–3x | Stats + single combined cover filmstrip |
| 4x+ | Stats + per-library cover filmstrips + recently added grouped by library |

### Screenshots

| | Light | Dark |
|---|---|---|
| **1x** | ![1x light](./screenshots/1x-light.png) | ![1x dark](./screenshots/1x-dark.png) |
| **2x** | ![2x light](./screenshots/2x-light.png) | ![2x dark](./screenshots/2x-dark.png) |
| **4x** | ![4x light](./screenshots/4x-light.png) | ![4x dark](./screenshots/4x-dark.png) |

---

## Ratings filter

Set **Maximum age rating** in the panel config to hide series above it (uses Kavita's per-series age rating, filtered server-side). Series without a rating are hidden when a filter is active.

---

## Notes

- **Auth:** API key is sent as the `x-api-key` header on every request
- **Cover proxy:** Cover images are fetched server-side by Stoa and cached in the browser for 24 hours — the browser never contacts Kavita directly; only the Stoa server needs network access to it
- **Library grouping:** The 4x filmstrips and list are derived from the 30 most recently added series. Libraries with no recent additions will not appear as a strip
- **Polling and SSE:** Stoa polls Kavita every 30 minutes. Results are cached and pushed to all connected browsers via SSE — no manual refresh needed
- **API calls per poll:** `GET /api/Stats/server/stats` (series + file counts), `GET /api/Library/libraries` (library list), `POST /api/Series/recently-added-v2?pageNumber=1&pageSize=30` (recently added series)
