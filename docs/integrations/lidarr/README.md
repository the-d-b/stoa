# Lidarr

**Category:** Media Management | **Status:** Tested | **Polling:** 30 min

---

## Integration

**Secret format:** Plain API key

> Lidarr -> Settings -> General -> Security -> API Key

**URL required:** Required

**Example URL:** `http://192.168.1.10:8686`

### Setup

1. Lidarr -> Settings -> General -> copy the API Key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type Lidarr, URL, secret
4. Admin -> Panels -> New: type Lidarr

---

## Panel

Upcoming album releases, recently downloaded albums, wanted/missing albums, artist and track counts.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Upcoming albums + queue count |
| 2-3x | Queue list + recent albums |
| 4x+ | Full release schedule + artist stats |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

**Calendar:** Lidarr release dates appear on the Calendar panel.