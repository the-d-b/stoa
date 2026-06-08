# Scrutiny

**Category:** Storage | **Status:** Need Testing | **Polling:** 5 min

---

## Integration

**Secret format:** Blank - no authentication required

> Scrutiny runs unauthenticated by default. Leave the API key field empty.

**URL required:** Required

**Example URL:** `http://192.168.1.10:8080`

### Setup

1. No credential needed - leave secret blank
2. Admin -> Integrations -> New: type Scrutiny, URL = http://scrutiny:8080, no secret
3. Admin -> Panels -> New: type Scrutiny

---

## Panel

Hard drive SMART health - fleet health donut showing passed/warning/failed drive counts, per-drive temperature bars, power-on hours, and reallocated/pending sector warnings.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Healthy/warning/failed counts + avg temp |
| 2-3x | Summary chips + per-drive list with status and temperature |
| 4x+ | Fleet health donut + full drive detail with model, capacity, temps, sectors |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Temperature bars: green <40C, amber 40-49C, red >=50C.