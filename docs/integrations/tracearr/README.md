# Tracearr

**Category:** Media Servers | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** Plain API key

> Tracearr -> Settings -> API Key

**URL required:** Required

**Example URL:** `http://192.168.1.10:8000`

### Setup

1. Tracearr -> Settings -> copy API Key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type Tracearr, URL, secret
4. Admin -> Panels -> New: type Tracearr

---

## Panel

Live stream count, watch history, top users, recent plays, and unacknowledged account-sharing violations. Works across Plex, Jellyfin, and Emby.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Live streams + sharing alerts |
| 2-3x | Recent plays + top users |
| 4x+ | Full stats + sharing violations detail |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*