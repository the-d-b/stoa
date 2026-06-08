# Sonarr

**Category:** Media Management | **Status:** Tested | **Polling:** 30 min

---

## Integration

**Secret format:** Plain API key

> Sonarr -> Settings -> General -> Security -> API Key

**URL required:** Required

**Example URL:** `http://192.168.1.10:8989`

### Setup

1. Sonarr -> Settings -> General -> copy the API Key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type Sonarr, URL = http://sonarr:8989, secret = key above
4. Admin -> Panels -> New: type Sonarr, select integration

---

## Panel

Upcoming episode schedule, recently downloaded episodes, wanted/missing episodes, series and episode counts.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Upcoming episode count + queue + wanted counts |
| 2-3x | Queue list with progress + calendar preview |
| 4x+ | Full episode schedule + series stats + download queue detail |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

**Calendar:** Sonarr episode air dates appear on the Calendar panel. Add Sonarr as a calendar source in Profile -> Calendar Sources.