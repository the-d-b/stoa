# autobrr

**Category:** Media Management | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** Plain API key

> autobrr -> Settings -> API -> API Key

**URL required:** Required

**Example URL:** `http://192.168.1.10:7474`

### Setup

1. autobrr -> Settings -> API -> copy API Key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type autobrr, URL, secret
4. Admin -> Panels -> New: type autobrr

---

## Panel

IRC network connection health, cumulative grab/reject/error statistics, and a live feed of recent releases.

### Height behavior

| Height | What you see |
|---|---|
| 1x | IRC health + grab/reject counts |
| 2-3x | Grab donut + IRC networks + recent activity |
| 4x+ | Full three-column: IRC networks / activity feed / grabs-only feed |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*