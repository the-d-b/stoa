# Radarr

**Category:** Media Management | **Status:** Tested | **Polling:** 30 min

---

## Integration

**Secret format:** Plain API key

> Radarr -> Settings -> General -> Security -> API Key

**URL required:** Required

**Example URL:** `http://192.168.1.10:7878`

### Setup

1. Radarr -> Settings -> General -> copy the API Key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type Radarr, URL, secret
4. Admin -> Panels -> New: type Radarr

---

## Panel

Upcoming movie releases, recently downloaded movies, wanted/missing movies, movie count.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Upcoming movies + queue count |
| 2-3x | Queue list + recent movies |
| 4x+ | Full release schedule + download queue detail |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

**Calendar:** Radarr release dates appear on the Calendar panel.