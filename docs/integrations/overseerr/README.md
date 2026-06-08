# Overseerr / Jellyseerr

**Category:** Media Management | **Status:** Need Testing | **Polling:** 5 min

---

## Integration

**Secret format:** Plain API key

> Overseerr -> Settings -> General -> API Key  |  Jellyseerr -> same location

**URL required:** Required

**Example URL:** `http://192.168.1.10:5055`

### Setup

1. Overseerr/Jellyseerr -> Settings -> General -> copy API Key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type Overseerr, URL, secret
4. Admin -> Panels -> New: type Overseerr

---

## Panel

Request counts by status, movie vs. TV breakdown, recent pending requests.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Pending request count + status breakdown |
| 2-3x | Request stats + recent pending list |
| 4x+ | Full request dashboard + status breakdown |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Works for both Overseerr and Jellyseerr - use the same integration type.