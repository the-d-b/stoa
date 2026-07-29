---
id: map
name: Map
category: Stoa Features
tags: [location, built-in]
status: experimental
---

# Map

## What is the Map panel?

The Map panel is a built-in Stoa panel that plots live GPS markers on a map, aggregating location sources (currently Life360) added per panel — the same pluggable-source pattern as the Calendar panel. It needs no integration of its own; you add sources on each panel.

---

## Panel

A multi-source live location map that aggregates GPS markers from any combination of:

- **Life360** — every circle member's current location, battery level, and address

More GPS sources may be added over time, the same way Calendar grew beyond its first few sources — Map follows the identical pluggable-source pattern.

Each marker is colored per person (consistent across refreshes) and shown as a colored initial — Life360's own avatar images require a Life360 session to load and can't be embedded directly, so Stoa doesn't attempt to fetch them.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Compact summary — tracked count, low-battery count, most recent update time. No map; too small to be useful at this size. |
| 2-3x | Live map, filling the panel |
| 4x+ | Map plus a roster list below it (name, address, battery, last update) with per-person filter pills |

### Full-screen view

At 2x+ heights, the ⛶ button in the top-right corner opens a full-screen map overlay (desktop only): a larger map alongside a full roster list and the same per-person filter pills. Press Escape or click the backdrop to close.

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending — add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Source setup

Sources are managed per panel: **Profile → Map panel → Edit → Map sources** (for personal panels), or **Admin → Panels → Edit → Map sources** (for system panels).

### Life360

Requires a Life360 integration — see [Life360](../life360/README.md) for the full setup, including the manual session-token extraction steps (Life360 has no normal API key). Add source → select the Life360 integration.

---

## Polling

Like Calendar, Map never fetches live from a source at panel-view time — it reads whatever its source's own background worker last cached. For Life360 that's its own configured refresh interval (default 2 minutes; see [Life360](../life360/README.md#notes) for why that's kept conservative). Viewing a Map panel is instant regardless of how many sources it has.

Unlike Calendar, the Map panel itself also re-polls its own aggregated data on a 60-second timer while it's on screen — location is time-sensitive in a way calendar events generally aren't, so the panel doesn't wait for a full remount to pick up a source's next cached update.
