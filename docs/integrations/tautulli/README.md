---
id: tautulli
name: Tautulli
category: Media Servers
tags: [analytics, plex, self-hosted]
official_url: https://tautulli.com
status: tested
polling: 60s
secret_format: api-key
url_required: true
example_url: http://192.168.1.10:8181
---

# Tautulli

## What is Tautulli?

Tautulli is a monitoring and analytics companion for Plex. It connects to your Plex Media Server and records everything that plays — who watched what, when, for how long, on which device, and whether it transcoded — then turns that into watch history, per-user statistics, most-watched charts, and notifications. It doesn't stream media itself; it's the reporting layer that sits on top of Plex.

**Official site:** [tautulli.com](https://tautulli.com)

---

## Getting the key

Tautulli → **Settings → Web Interface** → scroll to the API section → copy the **API Key**.

- **Secret format:** plain API key
- **URL:** required — point at your Tautulli port, e.g. `http://192.168.1.10:8181`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the API key.
2. **Admin → Integrations → New** — select **Tautulli**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Tautulli**.

---

## Panel

**Analytics panel** — shows historical play statistics, top viewers, most played content, and recent play history for the selected time range. This is not a now-playing panel; for live stream monitoring use the Plex panel directly.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Stat tiles: total plays · hours watched · unique users · time range label |
| 2–3x | Time range picker · summary chips (plays / hours / users) · top viewers with bar chart |
| 4x+ | + Most played content section · recent play history list |

### Time range selection

The `[1d] [7d] [30d] [∞]` pill picker controls the reporting window. Selecting a pill re-fetches data for that period. The `∞` option returns all-time data from Tautulli's full configured history. The selected range is persisted to the panel config and restored on reload.

### How data flows

On each 60-second poll cycle the backend calls Tautulli's `get_home_stats` and `get_users_table` API commands for the configured time range. Play totals, duration, unique user count, top users, most played items, and recent history are all derived from these responses and cached by integration ID.

The panel subscribes to **Server-Sent Events (SSE)**. When the worker refreshes the cache, it broadcasts a `cache-update` event on the integration's SSE channel. The panel receives this signal and re-fetches with the current time range selection — keeping the display current without any user action.

### Screenshots

| | Light | Dark |
|---|---|---|
| **1x** | ![1x light](./screenshots/1x-light.png) | ![1x dark](./screenshots/1x-dark.png) |
| **2x** | ![2x light](./screenshots/2x-light.png) | ![2x dark](./screenshots/2x-dark.png) |
| **4x** | ![4x light](./screenshots/4x-light.png) | ![4x dark](./screenshots/4x-dark.png) |

---

## Notes

- Tautulli must be connected to a running Plex Media Server — it only records play history for sessions it has observed.
- The `∞` time range queries Tautulli's full history retention. If retention is configured shorter than 30 days, the 30d option will return incomplete data.
