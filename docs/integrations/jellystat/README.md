---
id: jellystat
name: Jellystat
category: Media Servers
tags: [analytics, jellyfin, self-hosted]
official_url: https://github.com/CyferShepard/Jellystat
status: tested
polling: 60s
secret_format: api-key
url_required: true
example_url: http://192.168.1.10:3004
---

# Jellystat

## What is Jellystat?

Jellystat is a self-hosted statistics and watch-history dashboard for Jellyfin — essentially what Tautulli is to Plex. It syncs with your Jellyfin server and records play activity, then breaks it down by user, media type, and title so you can see what's being watched and by whom. It's an add-on analytics layer, not a media server.

**Official site:** [github.com/CyferShepard/Jellystat](https://github.com/CyferShepard/Jellystat)

---

## Getting the key

Jellystat → **Settings** → generate or copy the **API Key** from the API section.

- **Secret format:** plain API key
- **URL:** required — point at your Jellystat port, e.g. `http://192.168.1.10:3004`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the API key.
2. **Admin → Integrations → New** — select **Jellystat**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Jellystat**.

---

## Panel

**Analytics panel** — shows historical play statistics broken down by media type (movies, series, audio, other), top viewers with a bar chart, top movies, and top series for the selected time range. This is not a now-playing panel; for live stream monitoring use the Jellyfin panel directly.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Stat tiles: total plays · active users · time range label |
| 2–3x | Time range picker · per-type view chips (movies / series / audio / other / total) · top viewers with bar chart |
| 4x+ | + Top movies list · top series list |

### Time range selection

The `[1d] [7d] [30d] [∞]` pill picker controls the reporting window. Selecting a pill re-fetches data for that period. The `∞` option returns all-time data from Jellystat's full history. The selected range is persisted to the panel config and restored on reload.

### How data flows

On each 60-second poll cycle the backend queries Jellystat's statistics API for the configured time range, retrieving view counts by media type, top users, top movies, and top series. Results are cached by integration ID.

The panel subscribes to **Server-Sent Events (SSE)**. When the worker refreshes the cache, it broadcasts a `cache-update` event on the integration's SSE channel. When a time range pill is changed, the frontend re-fetches with the new `timeRange` parameter and the backend queries Jellystat fresh for that window — bypassing the cache.

### Screenshots

| | Light | Dark |
|---|---|---|
| **1x** | ![1x light](./screenshots/1x-light.png) | ![1x dark](./screenshots/1x-dark.png) |
| **2x** | ![2x light](./screenshots/2x-light.png) | ![2x dark](./screenshots/2x-dark.png) |
| **4x** | ![4x light](./screenshots/4x-light.png) | ![4x dark](./screenshots/4x-dark.png) |

---

## Notes

- Jellystat must be pointed at a Jellyfin server and have an active sync to record play history.
- The user count shown in the 1x tile reflects the number of users who appear in the top users list, not total Jellyfin accounts.
